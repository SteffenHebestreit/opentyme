declare module 'archiver' {
  import { Readable, Transform } from 'stream';

  interface ArchiverOptions {
    zlib?: {
      level?: number;
    };
    store?: boolean;
  }

  interface EntryData {
    name?: string;
    prefix?: string;
    date?: Date | string;
    mode?: number;
    stats?: any;
  }

  interface Archiver extends Transform {
    pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean }): T;
    append(source: Buffer | Readable | string, data?: EntryData): this;
    directory(dirpath: string, destpath: string | false, data?: EntryData): this;
    file(filepath: string, data?: EntryData): this;
    finalize(): Promise<void>;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'warning', listener: (err: Error) => void): this;
    on(event: 'entry', listener: (entry: EntryData) => void): this;
    on(event: 'progress', listener: (progress: { entries: { total: number; processed: number }; fs: { totalBytes: number; processedBytes: number } }) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    pointer(): number;
  }

  function archiver(format: 'zip' | 'tar' | 'json', options?: ArchiverOptions): Archiver;
  
  export default archiver;
}
