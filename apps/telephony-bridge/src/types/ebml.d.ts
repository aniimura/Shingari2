declare module 'ebml' {
  import { Transform } from 'node:stream';

  export type EbmlTag =
    | [
        'start' | 'end',
        {
          name: string;
          type?: string;
          [key: string]: unknown;
        },
      ]
    | [
        'tag',
        {
          name: string;
          type?: string;
          data: Buffer;
          [key: string]: unknown;
        },
      ];

  export class Decoder extends Transform {
    constructor(options?: Record<string, unknown>);
  }

  export class Encoder extends Transform {
    constructor(options?: Record<string, unknown>);
  }
}
