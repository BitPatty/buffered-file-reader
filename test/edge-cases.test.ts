import { assert } from 'console';
import { statSync } from 'fs';

import createReader, { BufferedFileReader, Separator } from '../src';

import { createTmpFile, getTestFilePath, runReader } from './test-utils';
import { unlink, writeFile } from 'fs/promises';

const LONG_STRING = new Array(1234).fill('abc').join('');

const filePath = getTestFilePath('empty-file.bin');
const fileSize = statSync(filePath).size;

assert(fileSize === 0);

describe('Edge Cases', () => {
  test('Start Offset Greater Than Input Size Returns Empty Chunk', async () => {
    await expect(runReader('abc', { startOffset: 8 })).resolves.toMatchChunks([
      '',
    ]);
  });

  test('Chunk Size Greater Than Input Size Returns Input', async () => {
    await expect(runReader('abc', { chunkSize: 100 })).resolves.toMatchChunks([
      'abc',
    ]);
  });

  test('Empty File Returns Empty Chunk', async () => {
    const r = createReader(filePath);
    const c = await r.next();
    expect(c.done).toBe(true);
  });

  describe.each([[true], [false]])('With Trim: %s', (trimSeparator) => {
    test('Separator Greater Than Input Returns Input', async () => {
      await expect(
        runReader('abc', {
          separator: new Uint8Array([1, 2, 3, 4, 5]),
          trimSeparator,
        }),
      ).resolves.toMatchChunks(['abc']);
    });

    test('Separator Greater Than Chunk Size Continues Reading Chunks', async () => {
      await expect(
        runReader(LONG_STRING, {
          separator: new Uint8Array(Buffer.from('abcabcabc')),
          chunkSize: 2,
          trimSeparator,
        }),
      ).resolves.toMatchChunks([
        ...new Array(411).fill(trimSeparator ? '' : 'abcabcabc'),
        'abc',
      ]);
    });

    test('Partial Separator Match Continues Reading', async () => {
      await expect(
        runReader(LONG_STRING, {
          separator: new Uint8Array(Buffer.from('abcd')),
          chunkSize: 2,
          trimSeparator,
        }),
      ).resolves.toMatchChunks([LONG_STRING]);
    });

    test('Long Input With Non Present Separator Returns Input', async () => {
      await expect(
        runReader(LONG_STRING, {
          separator: Separator.NULL_TERMINATOR,
          trimSeparator,
        }),
      ).resolves.toMatchChunks([LONG_STRING]);
    });

    test('Empty File With Separator Returns Empty Chunkk', async () => {
      const r = createReader(filePath, {
        separator: new Uint8Array([0x00]),
        trimSeparator,
      });
      const c = await r.next();
      expect(c.done).toBe(true);
    });
  });

  test('Continues On File Shortening', async () => {
    const tempFile = await createTmpFile(Buffer.from('abcdef'));
    const reader = BufferedFileReader.create(tempFile, {
      chunkSize: 1,
      throwOnFileModification: false,
    });

    await reader.next();
    await reader.next();
    await reader.next();

    await writeFile(tempFile, 'a');
    await expect(reader.next()).resolves.toMatchObject({
      done: true,
      value: null,
    });
  });

  // Note: this case not throwing is expected behaviour as only
  // the link is deleted and not the file itself
  test('Continues Mid-Procssing File Deletion', async () => {
    const tempFile = await createTmpFile(Buffer.from('abcdef'));
    const reader = BufferedFileReader.create(tempFile, {
      chunkSize: 1,
      throwOnFileModification: false,
    });

    await reader.next();
    await unlink(tempFile);

    await expect(reader.next()).resolves.toMatchObject({
      value: { chunkCursor: { start: 1, end: 2 } },
    });

    await reader.return(null);
  });
});
