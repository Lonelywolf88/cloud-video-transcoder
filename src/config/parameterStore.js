import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";

const DEFAULT_PREFIX = "/cab432/g58/app/";
const DEFAULT_REGION = "ap-southeast-2";

const parameterMap = new Map();

function getClientRegion() {
  return process.env.AWS_REGION || process.env.DEFAULT_AWS_REGION || DEFAULT_REGION;
}

function getParameterName(key) {
  const prefix = process.env.PARAMETER_STORE_PREFIX || DEFAULT_PREFIX;
  const normalisedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${normalisedPrefix}${key}`;
}

async function fetchParameters(keys) {
  const client = new SSMClient({ region: getClientRegion() });
  const names = keys.map(getParameterName);

  const response = await client.send(
    new GetParametersCommand({
      Names: names,
      WithDecryption: true
    })
  );

  if (response.InvalidParameters?.length) {
    throw new Error(
      `[parameter-store] Missing parameters: ${response.InvalidParameters.join(", ")}`
    );
  }

  for (const param of response.Parameters || []) {
    const key = keys[names.indexOf(param.Name)];
    parameterMap.set(key, param.Value ?? "");
    process.env[key] = param.Value ?? "";
  }
}

export async function ensureParametersLoaded(keys = []) {
  const useSSM = (process.env.USE_PARAMETER_STORE ?? "true").toLowerCase() !== "false";
  if (!useSSM || !keys.length) {
    return;
  }

  const missing = keys.filter((key) => !process.env[key]);
  if (!missing.length) {
    return;
  }

  await fetchParameters(missing);
}
