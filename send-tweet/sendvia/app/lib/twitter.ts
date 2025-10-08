import { TwitterApi } from 'twitter-api-v2';

export function createTwitterClient() {
  const {
    TWITTER_CONSUMER_KEY,
    TWITTER_CONSUMER_SECRET,
    TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_TOKEN_SECRET
  } = process.env;

  if (!TWITTER_CONSUMER_KEY || !TWITTER_CONSUMER_SECRET ||
      !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
    return null;
  }

  return new TwitterApi({
    appKey: TWITTER_CONSUMER_KEY,
    appSecret: TWITTER_CONSUMER_SECRET,
    accessToken: TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_TOKEN_SECRET,
  });
}

export async function downloadAndUploadImage(
  twitterClient: TwitterApi,
  imageUrl: string
) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, {
    mimeType: 'image/jpeg'
  });

  return mediaId;
}

