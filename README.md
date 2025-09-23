To test run in local(fastest way), run:
docker compose up --build
Need to do "aws configure sso" to able to sign in to s3



1. docker
AWS_REGION=ap-southeast-2
AWS_ACCOUNT_ID=901444280953
REPO=g57-a2
TAG=v2
ECR_URI=901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/g57-a2

aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com
docker build -t ${REPO}:${TAG} .
docker tag ${REPO}:${TAG} ${ECR_URI}:${TAG}
docker push ${ECR_URI}:${TAG}

2. deploy
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com
docker pull ${ECR_URI}:${TAG}
docker run -d   --name videotranscoder   --restart unless-stopped   -p 80:8000   --env-file .env   ${ECR_URI}:${TAG}

3. Parameter Store
- Create SSM parameters (String or SecureString) using the prefix /cab432/g57/app/:
  - /cab432/g57/app/PORT
  - /cab432/g57/app/JWT_EXPIRES
  - /cab432/g57/app/HF_IMAGE_MODEL
  - /cab432/g57/app/TAGS_TOP_K
  - /cab432/g57/app/TAGS_MIN_SCORE
  - /cab432/g57/app/AWS_REGION
  - /cab432/g57/app/QUT_USERNAME
  - /cab432/g57/app/TRANSCODE_LOCK_TTL_MS
- Grant the runtime IAM role ssm:GetParameters permissions.
- Set USE_PARAMETER_STORE=true (and optionally PARAMETER_STORE_PREFIX if you choose a different path) so the service loads these values at startup.
