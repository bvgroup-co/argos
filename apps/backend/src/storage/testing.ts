import { invariant } from "@argos/util/invariant";
import { S3Client } from "@aws-sdk/client-s3";
import { describe } from "vitest";

import config from "@/config";

/**
 * AWS-backed storage tests exercise real S3/DynamoDB services. Forked PR CI
 * does not receive those credentials, so skip only this external-service test
 * surface when credentials are unavailable.
 */
function hasAwsCredentials() {
  return Boolean(
    process.env["AWS_ACCESS_KEY_ID"] && process.env["AWS_SECRET_ACCESS_KEY"],
  );
}

export function describeWithAwsCredentials(
  name: string,
  factory: () => void | Promise<void>,
) {
  return describe.skipIf(!hasAwsCredentials())(name, factory);
}

export function createS3TestClient(region = config.get("s3.region")) {
  invariant(hasAwsCredentials(), "AWS credentials are required for this test");
  return new S3Client({ region });
}
