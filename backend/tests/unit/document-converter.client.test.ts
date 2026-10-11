import { each } from '../helpers/table';
import axios from 'axios';
import FormData from 'form-data';
import {
  DocumentConverterClient,
  DocumentConversionError,
} from '../../src/services/ai/mcp-client.service';

/**
 * The converter's REST route takes the file as a multipart file part plus a
 * small `params` JSON field. Starlette caps non-file form fields at 1 MB, so
 * the file must never travel base64-encoded inside `params`.
 */
describe('DocumentConverterClient', () => {
  let post: jest.Mock;

  beforeEach(() => {
    post = jest.fn();
    jest.spyOn(axios, 'create').mockReturnValue({ post } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function okResponse(markdown: unknown) {
    return { data: { success: true, result: { success: true, markdown, title: null } } };
  }

  it('sends the file as a multipart file part with a small params field', async () => {
    post.mockResolvedValue(okResponse('# Rechnung\nGesamt 12,00 EUR'));
    // 2 MB — base64 inside params (old behaviour) would exceed Starlette's 1 MB field limit
    const file = Buffer.alloc(2 * 1024 * 1024, 0x41);

    const client = new DocumentConverterClient('http://converter:8000');
    const text = await client.extractDocumentText(file, 'Rechnung März.pdf', 'application/pdf');

    expect(text).toBe('# Rechnung\nGesamt 12,00 EUR');
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://converter:8000' })
    );
    expect(post).toHaveBeenCalledTimes(1);
    const [path, body, config] = post.mock.calls[0];
    expect(path).toBe('/api/tools/file_to_markdown');
    expect(body).toBeInstanceOf(FormData);
    expect(config.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);

    const raw = (body as FormData).getBuffer().toString('latin1');
    expect(raw).toMatch(/Content-Disposition: form-data; name="file"; filename="[^"]*\.pdf"/);
    expect(raw).toContain('Content-Type: application/pdf');
    expect(raw).toContain('Content-Disposition: form-data; name="params"');
    // The params part carries only the filename; the file bytes are in the file part.
    const paramsPart = raw.split('name="params"')[1].split('--')[0];
    expect(paramsPart.length).toBeLessThan(200);
    expect(paramsPart).toContain('"filename"');
    expect(paramsPart).not.toContain('base64_content');
    expect(raw).not.toContain(file.toString('base64').slice(0, 64));
    expect((body as FormData).getBuffer().length).toBeGreaterThan(file.length);
  });

  it('accepts a plain string result', async () => {
    post.mockResolvedValue({ data: { success: true, result: 'text' } });
    const client = new DocumentConverterClient('http://converter:8000');
    await expect(client.extractDocumentText(Buffer.from('x'), 'a.png', 'image/png')).resolves.toBe('text');
  });

  each([[''], ['   \n '], [null]])('reports NO_TEXT for an empty extraction (%p)', async (markdown) => {
    post.mockResolvedValue(okResponse(markdown));
    const client = new DocumentConverterClient('http://converter:8000');
    await expect(client.extractDocumentText(Buffer.from('%PDF'), 'scan.pdf')).rejects.toMatchObject({
      name: 'DocumentConversionError',
      code: 'NO_TEXT',
    });
  });

  it('reports FAILED when the tool reports an error', async () => {
    post.mockResolvedValue({ data: { success: true, result: { success: false, error: 'Conversion failed: bad PDF' } } });
    const client = new DocumentConverterClient('http://converter:8000');
    await expect(client.extractDocumentText(Buffer.from('%PDF'), 'a.pdf')).rejects.toMatchObject({ code: 'FAILED' });
  });

  it('reports FAILED with the upstream status for HTTP errors', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500, data: { detail: 'Invalid JSON in params' } },
      })
    );
    const client = new DocumentConverterClient('http://converter:8000');
    const error = await client.extractDocumentText(Buffer.from('%PDF'), 'a.pdf').catch((e) => e);
    expect(error).toBeInstanceOf(DocumentConversionError);
    expect(error).toMatchObject({ code: 'FAILED', upstreamStatus: 500 });
    // Never leak the upstream detail through the error message
    expect(error.message).not.toContain('Invalid JSON');
  });

  it('reports UNREACHABLE when the converter cannot be reached', async () => {
    post.mockRejectedValue(Object.assign(new Error('getaddrinfo ENOTFOUND mcp-server'), { code: 'ENOTFOUND' }));
    const client = new DocumentConverterClient('http://mcp-server:8000');
    const error = await client.extractDocumentText(Buffer.from('%PDF'), 'a.pdf').catch((e) => e);
    expect(error).toMatchObject({ code: 'UNREACHABLE' });
    expect(error.message).not.toContain('mcp-server');
  });

  it('reports TIMEOUT when the converter is too slow', async () => {
    post.mockRejectedValue(Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' }));
    const client = new DocumentConverterClient('http://converter:8000');
    await expect(client.extractDocumentText(Buffer.from('%PDF'), 'a.pdf')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
