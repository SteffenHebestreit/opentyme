/**
 * @fileoverview Document conversion client.
 *
 * REST client for the FastAPI "MCP" server (fastapi_mcp_template) that turns a
 * receipt PDF or image into markdown text through its `file_to_markdown` tool.
 * It does not speak the MCP protocol — it calls the server's plain REST route
 * `POST /api/tools/{tool_name}`, which takes a multipart `file` part plus a
 * `params` form field holding a JSON object.
 *
 * The file has to travel as the multipart file part: Starlette caps non-file
 * form fields at 1 MB, so a base64 copy inside `params` failed for every
 * receipt larger than roughly 768 KB.
 */

import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import path from 'path';
import { logger } from '../../utils/logger';
import { classifyUpstreamError } from '../../utils/upstream-error';

/** Default address of the converter inside the Docker network. */
export const DEFAULT_DOCUMENT_CONVERTER_URL = 'http://mcp-server:8000';

/** Converting a scanned PDF can involve OCR / LLM vision per page. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Upload limit of the receipt route is 10 MB; leave room for multipart overhead. */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

export type DocumentConversionErrorCode =
  /** The document was converted but contains no readable text. */
  | 'NO_TEXT'
  /** The converter could not be reached (refused, DNS, host unreachable). */
  | 'UNREACHABLE'
  /** The converter did not answer in time. */
  | 'TIMEOUT'
  /** The converter answered with an error or an unexpected payload. */
  | 'FAILED';

export class DocumentConversionError extends Error {
  readonly code: DocumentConversionErrorCode;
  /** HTTP status of the converter's answer, when there was one. */
  readonly upstreamStatus?: number;

  constructor(code: DocumentConversionErrorCode, message: string, upstreamStatus?: number) {
    super(message);
    this.name = 'DocumentConversionError';
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

/** Shorten an upstream error detail for the server log. */
function describeDetail(detail: unknown): string {
  if (detail === undefined || detail === null) return '';
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/**
 * Client for the converter's `file_to_markdown` tool.
 */
export class DocumentConverterClient {
  private readonly client: AxiosInstance;
  readonly serverUrl: string;

  constructor(serverUrl?: string, options: { timeoutMs?: number } = {}) {
    this.serverUrl =
      serverUrl || process.env.MCP_SERVER_URL || DEFAULT_DOCUMENT_CONVERTER_URL;

    this.client = axios.create({
      baseURL: this.serverUrl,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBodyLength: MAX_BODY_BYTES,
      maxContentLength: MAX_BODY_BYTES,
    });
  }

  /**
   * Convert a receipt (PDF or image) to markdown text.
   *
   * The file_to_markdown tool converts PDFs and images alike: for an image it
   * runs markitdown's LLM description path (FTMD_MARKITDOWN_ENABLE_LLM), which
   * reads a photographed or scanned receipt well enough for the downstream
   * extraction prompt. The server picks the converter from the filename
   * extension, so the real filename has to be passed through.
   *
   * @param fileBuffer - Receipt file content (PDF or image)
   * @param filename - Original filename, extension included
   * @param contentType - MIME type of the file, when known
   * @returns The extracted text (never empty)
   * @throws DocumentConversionError
   */
  async extractDocumentText(
    fileBuffer: Buffer,
    filename: string,
    contentType?: string
  ): Promise<string> {
    const extension = path.extname(filename).toLowerCase() || '(none)';
    logger.info(
      `[DocumentConverter] Converting ${extension} document (${fileBuffer.length} bytes)`
    );

    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename,
      contentType: contentType || 'application/octet-stream',
    });
    formData.append('params', JSON.stringify({ filename }));

    let data: any;
    try {
      const response = await this.client.post('/api/tools/file_to_markdown', formData, {
        headers: formData.getHeaders(),
      });
      data = response.data;
    } catch (error: any) {
      const failure = classifyUpstreamError(error);
      if (failure.status !== undefined) {
        logger.error(
          `[DocumentConverter] file_to_markdown answered HTTP ${failure.status}: ${describeDetail(
            error.response?.data?.detail ?? error.response?.data
          )}`
        );
        throw new DocumentConversionError(
          'FAILED',
          `Document converter answered HTTP ${failure.status}`,
          failure.status
        );
      }
      logger.error(
        `[DocumentConverter] Request failed (${failure.kind}${
          failure.code ? `, ${failure.code}` : ''
        }): ${error?.message}`
      );
      if (failure.kind === 'timeout') {
        throw new DocumentConversionError('TIMEOUT', 'Document converter timed out');
      }
      if (failure.kind === 'unreachable') {
        throw new DocumentConversionError('UNREACHABLE', 'Document converter is unreachable');
      }
      throw new DocumentConversionError('FAILED', 'Document conversion request failed');
    }

    const text = this.readMarkdown(data);
    if (!text.trim()) {
      logger.warn(`[DocumentConverter] No readable text in ${extension} document`);
      throw new DocumentConversionError('NO_TEXT', 'The document contains no readable text');
    }

    logger.info(`[DocumentConverter] Extracted ${text.length} characters`);
    return text;
  }

  /**
   * Pull the markdown out of the REST envelope
   * `{ success, result: { success, markdown, … } }`.
   */
  private readMarkdown(data: any): string {
    if (!data || data.success !== true) {
      logger.error(
        `[DocumentConverter] Unexpected response envelope: ${describeDetail(
          data?.error ?? data?.detail ?? '(no error detail)'
        )}`
      );
      throw new DocumentConversionError('FAILED', 'Document converter returned an error');
    }

    const result = data.result;
    if (typeof result === 'string') return result;

    if (result && typeof result === 'object') {
      if (result.success === false) {
        logger.error(
          `[DocumentConverter] file_to_markdown failed: ${describeDetail(result.error)}`
        );
        throw new DocumentConversionError('FAILED', 'Document conversion failed');
      }
      if (typeof result.markdown === 'string') return result.markdown;
      if (typeof result.content === 'string') return result.content;
      // Converted, but markitdown produced no markdown at all (null).
      if (result.success === true && (result.markdown === null || result.markdown === undefined)) {
        return '';
      }
    }

    logger.error('[DocumentConverter] Response did not contain any markdown field');
    throw new DocumentConversionError('FAILED', 'Document converter returned an unexpected response');
  }
}
