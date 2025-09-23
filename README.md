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
docker run -d   --name g57-a2   --restart unless-stopped   -p 80:8000   --env-file .env   ${ECR_URI}:${TAG}

