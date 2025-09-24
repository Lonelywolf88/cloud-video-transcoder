To test run in local(fastest way), run:
docker compose up --build
Need to do "aws configure sso" to able to sign in to s3



1. docker
AWS_REGION=ap-southeast-2
AWS_ACCOUNT_ID=901444280953
REPO=g57-a2
TAG=v5
ECR_URI=901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/g57-a2

aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com
docker build -t ${REPO}:${TAG} .
docker tag ${REPO}:${TAG} ${ECR_URI}:${TAG}
docker push ${ECR_URI}:${TAG}

2. deploy
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com
docker pull ${ECR_URI}:${TAG}
docker run -d   --name g57-a2   --restart unless-stopped   -p 80:8000   --env-file .env   ${ECR_URI}:${TAG}


3. to test.
for the caching, run :
memcflush --server="g57-memcache.km2jzi.cfg.apse2.cache.amazonaws.com:11211"
memcdump --servers="g57-memcache.km2jzi.cfg.apse2.cache.amazonaws.com:11211"

it shows something that mean it is the cache
thumb:user/.../videos/.../thumbnail.jpg:v0
👉 These are binary thumbnail images cached from S3 (JPEGs).
videos:list:c93eb4a8-5091-7039-cb90-5408488a9de5:v1:p3:n6:s-created_at|s:|t:|q:
👉 This is the video list metadata cache entry.


for s3 just open the aws and show the s3 bucket name and video files
for dynamo. open the dynamo table and show some table items

dns just open the url just the dns name

presigned have some problem