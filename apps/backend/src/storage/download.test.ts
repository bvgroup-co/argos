import { readFile } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { S3Client } from "@aws-sdk/client-s3";
import { dirSync } from "tmp";
import { beforeAll, beforeEach, expect, it } from "vitest";

import config from "@/config";

import { download } from "./download";
import { get } from "./get";
import { createS3TestClient, describeWithAwsCredentials } from "./testing";
import { uploadFromFilePath } from "./upload";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const readFileAsync = promisify(readFile);

describeWithAwsCredentials("#download", () => {
  let s3: S3Client;
  let tmpDirectory: string;

  beforeAll(async () => {
    s3 = createS3TestClient("eu-west-1");
    await uploadFromFilePath({
      s3,
      Bucket: config.get("s3.screenshotsBucket"),
      Key: "hello.txt",
      inputPath: join(__dirname, "__fixtures__", "hello.txt"),
    });
  });

  beforeEach(() => {
    tmpDirectory = dirSync().name;
  });

  it("should download a file from S3", async () => {
    const outputPath = join(tmpDirectory, "hello.txt");
    const result = await get({
      s3,
      Bucket: config.get("s3.screenshotsBucket"),
      Key: "hello.txt",
    });
    await download(result, outputPath);

    const file = await readFileAsync(outputPath, "utf-8");
    expect(file).toEqual("hello!\n");
  }, 10000);
});
