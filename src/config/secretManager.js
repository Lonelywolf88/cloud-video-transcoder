import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretName = "group57/A2/secret"; // change if your secret name changes
const region = process.env.AWS_REGION || "ap-southeast-2";

const client = new SecretsManagerClient({ region });
let cachedSecrets = null;

export async function loadSecrets() {
  if (cachedSecrets) return cachedSecrets;

  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: secretName,
      VersionStage: "AWSCURRENT",
    })
  );

  const secrets = JSON.parse(response.SecretString);

  // Merge into process.env so the rest of your app doesn’t break
  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }

  cachedSecrets = secrets;
  return secrets;
}
