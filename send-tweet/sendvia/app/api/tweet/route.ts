import { NextRequest, NextResponse } from 'next/server';
import { createTwitterClient, downloadAndUploadImage } from '@/lib/twitter';

export async function POST(req: NextRequest) {
  const { text, imageUrl } = await req.json();

  // Validate tweet text
  if (!text || !text.trim()) {
    return NextResponse.json(
      { error: 'Tweet text is required' },
      { status: 400 }
    );
  }

  if (text.length > 280) {
    return NextResponse.json(
      { error: `Tweet exceeds 280 character limit (${text.length} characters)` },
      { status: 400 }
    );
  }

  const twitterClient = createTwitterClient();
  if (!twitterClient) {
    return NextResponse.json(
      { error: 'Twitter API not configured' },
      { status: 500 }
    );
  }

  try {
    let tweetOptions: any = {};

    if (imageUrl) {
      const mediaId = await downloadAndUploadImage(twitterClient, imageUrl);
      tweetOptions.media = { media_ids: [mediaId] };
    }

    const tweetResult = await twitterClient.v2.tweet(text, tweetOptions);

    return NextResponse.json({
      success: true,
      message: imageUrl
        ? `Tweet with image sent successfully! Tweet ID: ${tweetResult.data.id}`
        : `Tweet sent successfully! Tweet ID: ${tweetResult.data.id}`,
      tweetId: tweetResult.data.id,
      tweetUrl: `https://twitter.com/user/status/${tweetResult.data.id}`,
      data: tweetResult.data
    });

  } catch (error: any) {
    let errorMessage = 'Failed to send tweet';
    if (error.code === 403) {
      errorMessage = 'Twitter API permission denied. Check app has Read and Write permissions.';
    } else if (error.code === 401) {
      errorMessage = 'Twitter API authentication failed. Verify API keys.';
    } else if (error.code === 429) {
      errorMessage = 'Twitter API rate limit exceeded. Try again later.';
    } else {
      errorMessage = `Twitter API error: ${error?.message || String(error)}`;
    }

    return NextResponse.json(
      { error: errorMessage, details: error?.message },
      { status: 500 }
    );
  }
}

