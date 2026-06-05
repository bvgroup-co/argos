import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, expect, it } from "vitest";

import config from "@/config";

import { get } from "./get";
import { createS3TestClient, describeWithAwsCredentials } from "./testing";
import { uploadFromFilePath } from "./upload";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describeWithAwsCredentials("#get", () => {
  let s3: S3Client;

  afterAll(() => {
    s3.destroy();
  });

  beforeAll(async () => {
    s3 = createS3TestClient("eu-west-1");
    await uploadFromFilePath({
      s3,
      Bucket: config.get("s3.screenshotsBucket"),
      Key: "hello.txt",
      inputPath: join(__dirname, "__fixtures__", "hello.txt"),
    });
  });

  it("gets a file from S3", async () => {
    const result = await get({
      s3,
      Bucket: config.get("s3.screenshotsBucket"),
      Key: "hello.txt",
    });

    expect(result.ContentType).toBe("text/plain");
  });
});
