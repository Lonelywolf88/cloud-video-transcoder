1. docker
AWS_REGION=ap-southeast-2
AWS_ACCOUNT_ID=901444280953
REPO=12138657-assignment1
TAG=v13
ECR_URI=901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/12138657-assignment1

aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com
docker build -t ${REPO}:${TAG} .
docker tag ${REPO}:${TAG} ${ECR_URI}:${TAG}
docker push ${ECR_URI}:${TAG}

2. deploy
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com
docker pull ${ECR_URI}:${TAG}
docker run -d   --name videotranscoder   --restart unless-stopped   -p 80:8000   -v /srv/videotranscoder/data:/data   --env-file /srv/videotranscoder/.env   ${ECR_URI}:${TAG}

