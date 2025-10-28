import { processPayment, type OrderData } from "@helpers/payment";
import { type UserProfile } from "@lib/types";

async function test() {
  console.log(`\n${"=".repeat(50)}\n`);
  console.log("Test 1");
  const orderData: OrderData = {
    productLocator: "amazon:B004XWNHEC",
    email: "angela.temp+user@paella.dev",
    physicalAddress: {
      name: "Angela",
      line1: "123 Test Street",
      line2: "Apt 1",
      city: "Test City",
      state: "CA",
      postalCode: "10001",
      country: "US",
    },
    payment: {
      method: "base-sepolia",
      currency: "USDC",
    },
  };

  const userProfile: UserProfile = {
    inboxId: "test-inbox-id",
    name: "Angela",
    email: "angela.temp+user@paella.dev",
    shippingAddress: {
      line1: "123 Test Street",
      line2: "Apt 1",
      city: "Test City",
      state: "CA",
      postalCode: "10001",
      country: "US",
    },
    hostWalletAddress: "0x1234567890123456789012345678901234567890",
    isComplete: true,
    orderHistory: [],
  };

  const result = await processPayment({
    orderData,
    orderServerUrl: "http://localhost:3000",
    userProfile,
  });
  console.log("Result:", result.success ? "✅ Success" : `❌ ${result.error}`);

  console.log(`\n${"=".repeat(50)}\n`);

  console.log("\n🏁 Test suite completed!");
}

test().catch(console.error);
