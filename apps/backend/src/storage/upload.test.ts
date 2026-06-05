import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { S3Client } from "@aws-sdk/client-s3";
import { beforeEach, expect, it } from "vitest";

import config from "@/config";

import { createS3TestClient, describeWithAwsCredentials } from "./testing";
import { uploadFromFilePath } from "./upload";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describeWithAwsCredentials("#uploadFromFilePath", () => {
  let s3: S3Client;

  beforeEach(() => {
    s3 = createS3TestClient("eu-west-1");
  });

  it("should upload a file to S3", async () => {
    const inputPath = join(__dirname, "__fixtures__", "screenshot_test.jpg");
    const data = await uploadFromFilePath({
      s3,
      inputPath,
      Bucket: config.get("s3.screenshotsBucket"),
    });

    expect(data.Key).not.toBe(undefined);
  });
});
