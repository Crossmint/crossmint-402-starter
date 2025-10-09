import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, parseEther, parseUnits, createPublicClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC
const MIN_USDC_BALANCE = 0.05; 
const MIN_ETH_BALANCE = 0.001;

const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const;

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, currentBalances } = await req.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    let faucetPrivateKey = process.env.FAUCET_PRIVATE_KEY;
    if (!faucetPrivateKey) {
      return NextResponse.json(
        {
          funded: false,
          message: 'Faucet not configured. Please add FAUCET_PRIVATE_KEY to environment variables.',
          skipFaucet: true
        },
        { status: 200 }
      );
    }

    // Ensure private key has 0x prefix
    if (!faucetPrivateKey.startsWith('0x')) {
      faucetPrivateKey = `0x${faucetPrivateKey}`;
    }

    const usdcBalance = parseFloat(currentBalances?.usdc || '0');
    const ethBalance = parseFloat(currentBalances?.eth || '0');

    const needsUSDC = usdcBalance < MIN_USDC_BALANCE;
    const needsETH = ethBalance < MIN_ETH_BALANCE;

    if (!needsUSDC && !needsETH) {
      return NextResponse.json({
        funded: false,
        message: 'Wallet has sufficient balance'
      });
    }

    const account = privateKeyToAccount(faucetPrivateKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http()
    });

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http()
    });

    const transactions: { type: string; hash: string; amount: string }[] = [];

    // Get current nonce for sequential transactions
    let currentNonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending' // Include pending transactions
    });

    // Send USDC if needed
    if (needsUSDC) {
      const usdcAmount = process.env.FAUCET_USDC_AMOUNT || '1';
      const amountToSend = parseUnits(usdcAmount, 6); // USDC has 6 decimals

      const hash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [walletAddress as `0x${string}`, amountToSend],
        nonce: currentNonce
      } as any);

      transactions.push({
        type: 'USDC',
        hash,
        amount: usdcAmount
      });

      currentNonce++; // Increment for next transaction
    }

    // Send ETH if needed
    if (needsETH) {
      const ethAmount = process.env.FAUCET_ETH_AMOUNT || '0.01';
      const amountToSend = parseEther(ethAmount);

      const hash = await walletClient.sendTransaction({
        to: walletAddress as `0x${string}`,
        value: amountToSend,
        nonce: currentNonce
      } as any);

      transactions.push({
        type: 'ETH',
        hash,
        amount: ethAmount
      });
    }

    return NextResponse.json({
      funded: true,
      transactions,
      message: `Funded with ${transactions.map(t => `${t.amount} ${t.type}`).join(' and ')}`
    });

  } catch (error: any) {
    console.error('Faucet error:', error);

    // Return user-friendly error messages
    let errorMessage = 'Failed to fund wallet';

    if (error?.message?.includes('nonce')) {
      errorMessage = 'Pending transaction detected. Please try again in a moment.';
    } else if (error?.message?.includes('insufficient funds')) {
      errorMessage = 'Faucet wallet has insufficient funds. Please refill the faucet.';
    } else if (error?.message?.includes('replacement transaction underpriced')) {
      errorMessage = 'Transaction in progress. Please wait a moment and try again.';
    } else {
      errorMessage = error?.message || 'Failed to fund wallet';
    }

    return NextResponse.json(
      {
        funded: false,
        error: errorMessage,
        skipFaucet: true // Skip UI error display
      },
      { status: 200 } // Return 200 to prevent console errors
    );
  }
}

