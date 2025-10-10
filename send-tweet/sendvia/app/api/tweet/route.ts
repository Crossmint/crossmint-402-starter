import { NextRequest, NextResponse } from 'next/server';
import { createTwitterClient, downloadAndUploadImage } from '@/lib/twitter';

export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🐦 [${timestamp}] [${requestId}] TWEET API START`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log(`📍 Request reached /api/tweet route handler`);
  console.log(`   This means payment was verified successfully by middleware`);

  // Log payment headers if present
  const paymentHeader = req.headers.get('X-PAYMENT');
  const paymentResponse = req.headers.get('X-PAYMENT-RESPONSE');

  if (paymentHeader) {
    console.log(`\n💳 Payment Headers:`);
    console.log(`   X-PAYMENT: ${paymentHeader.substring(0, 100)}...`);
  }
  if (paymentResponse) {
    console.log(`   X-PAYMENT-RESPONSE: ${paymentResponse}`);
  }

  let text: string;
  let imageUrl: string | undefined;

  try {
    const body = await req.json();
    text = body.text;
    imageUrl = body.imageUrl;

    console.log(`\n📝 Tweet Content:`);
    console.log(`   Text: "${text}"`);
    console.log(`   Text length: ${text?.length || 0} chars`);
    console.log(`   Image URL: ${imageUrl || 'none'}`);
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to parse request body:`, error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Validate tweet text
  if (!text || !text.trim()) {
    console.log(`❌ [${requestId}] Validation failed: Tweet text is empty`);
    return NextResponse.json(
      { error: 'Tweet text is required' },
      { status: 400 }
    );
  }

  if (text.length > 280) {
    console.log(`❌ [${requestId}] Validation failed: Tweet too long (${text.length} chars)`);
    return NextResponse.json(
      { error: `Tweet exceeds 280 character limit (${text.length} characters)` },
      { status: 400 }
    );
  }

  console.log(`✅ Tweet validation passed`);

  console.log(`\n🔑 Creating Twitter client...`);
  const twitterClient = createTwitterClient();
  if (!twitterClient) {
    console.error(`❌ [${requestId}] Twitter client creation failed: API not configured`);
    return NextResponse.json(
      { error: 'Twitter API not configured' },
      { status: 500 }
    );
  }
  console.log(`✅ Twitter client created successfully`);

  try {
    let tweetOptions: any = {};

    if (imageUrl) {
      console.log(`\n📷 Processing image upload...`);
      console.log(`   Image URL: ${imageUrl}`);

      try {
        const mediaId = await downloadAndUploadImage(twitterClient, imageUrl);
        tweetOptions.media = { media_ids: [mediaId] };
        console.log(`✅ Image uploaded successfully (Media ID: ${mediaId})`);
      } catch (imageError: any) {
        console.error(`❌ Image upload failed:`, imageError);
        throw imageError;
      }
    }

    console.log(`\n🚀 Posting tweet to Twitter API...`);
    const tweetResult = await twitterClient.v2.tweet(text, tweetOptions);

    console.log(`\n✅ Tweet posted successfully!`);
    console.log(`   Tweet ID: ${tweetResult.data.id}`);
    console.log(`   Tweet URL: https://twitter.com/user/status/${tweetResult.data.id}`);

    const response = {
      success: true,
      message: imageUrl
        ? `Tweet with image sent successfully! Tweet ID: ${tweetResult.data.id}`
        : `Tweet sent successfully! Tweet ID: ${tweetResult.data.id}`,
      tweetId: tweetResult.data.id,
      tweetUrl: `https://twitter.com/user/status/${tweetResult.data.id}`,
      data: tweetResult.data
    };

    console.log(`\n🐦 [${requestId}] TWEET API END - Success`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return NextResponse.json(response);

  } catch (error: any) {
    console.error(`\n❌ [${requestId}] Twitter API Error:`);
    console.error(`   Error code: ${error.code || 'unknown'}`);
    console.error(`   Error message: ${error?.message || String(error)}`);
    console.error(`   Full error:`, error);

    let errorMessage = 'Failed to send tweet';
    let statusCode = 500;

    if (error.code === 403) {
      errorMessage = 'Twitter API permission denied. Check app has Read and Write permissions.';
      statusCode = 403;
      console.log(`   ℹ️  This usually means the Twitter app needs "Read and Write" permissions`);
    } else if (error.code === 401) {
      errorMessage = 'Twitter API authentication failed. Verify API keys.';
      statusCode = 401;
      console.log(`   ℹ️  Check that Twitter API keys are correct in environment variables`);
    } else if (error.code === 429) {
      errorMessage = 'Twitter API rate limit exceeded. Try again later.';
      statusCode = 429;
      console.log(`   ℹ️  Twitter rate limit hit - wait 15 minutes before trying again`);
    } else {
      errorMessage = `Twitter API error: ${error?.message || String(error)}`;
      statusCode = 500;
    }

    console.log(`\n🐦 [${requestId}] TWEET API END - Error ${statusCode}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return NextResponse.json(
      { error: errorMessage, details: error?.message },
      { status: statusCode }
    );
  }
}

