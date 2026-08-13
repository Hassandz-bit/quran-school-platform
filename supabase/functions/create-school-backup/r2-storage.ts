import {
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.1098.0";

const BUCKET_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export type OffsiteBackupInput = {
  schoolId: string;
  snapshotId: string;
  createdAt: string;
  body: string;
  checksumSha256: string;
};

export type OffsiteBackupResult = {
  storageKey: string;
  bucket: string;
  objectKey: string;
};

function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

function validateEndpoint(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("backup_r2_invalid_endpoint");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    !parsed.hostname.endsWith(".r2.cloudflarestorage.com")
  ) {
    throw new Error("backup_r2_invalid_endpoint");
  }

  return parsed.origin;
}

function sanitizePrefix(value: string): string {
  const cleaned = value
    .split("/")
    .map(part => part.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join("/");
  return cleaned || "quranos-backups";
}

export async function persistBackupOffsite(
  input: OffsiteBackupInput
): Promise<OffsiteBackupResult | null> {
  const endpointRaw = env("QURANOS_BACKUP_R2_ENDPOINT");
  const bucket = env("QURANOS_BACKUP_R2_BUCKET");
  const accessKeyId = env("QURANOS_BACKUP_R2_ACCESS_KEY_ID");
  const secretAccessKey = env("QURANOS_BACKUP_R2_SECRET_ACCESS_KEY");

  const configuredValues = [
    endpointRaw,
    bucket,
    accessKeyId,
    secretAccessKey,
  ].filter(Boolean).length;

  if (configuredValues === 0) return null;
  if (configuredValues !== 4) {
    throw new Error("backup_r2_config_incomplete");
  }
  if (!BUCKET_RE.test(bucket)) {
    throw new Error("backup_r2_invalid_bucket");
  }

  const endpoint = validateEndpoint(endpointRaw);
  const prefix = sanitizePrefix(env("QURANOS_BACKUP_R2_PREFIX"));
  const date = input.createdAt.slice(0, 10);
  const objectKey = `${prefix}/schools/${input.schoolId}/${date}/${input.snapshotId}.json`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: input.body,
      ContentType: "application/json; charset=utf-8",
      Metadata: {
        quranos_sha256: input.checksumSha256,
        quranos_school_id: input.schoolId,
        quranos_snapshot_id: input.snapshotId,
      },
    })
  );

  return {
    storageKey: `r2://${bucket}/${objectKey}`,
    bucket,
    objectKey,
  };
}
