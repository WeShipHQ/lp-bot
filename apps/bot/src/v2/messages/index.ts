import { MessageBundle } from '../types/messages.types';

export const MESSAGES: MessageBundle = {
  commands: {
    start: {
      welcome: {
        template: "🎉 **Welcome to {botName}!**\n\n🚀 Your gateway to automated liquidity provision on Solana\n\n🔗 **Get Started**\nConnect your wallet to begin providing liquidity and earning fees!\n\n📋 **What you can do:**\n• 📊 View trending pools\n• 💼 Manage your portfolio\n• 🔄 Create and manage positions\n• 💰 Track your earnings\n\nUse the menu below to get started! 👇",
        parseMode: 'Markdown'
      },
      welcomeWithWallet: {
        template: "🎉 **Welcome to {botName}!**\n\n🚀 Your gateway to automated liquidity provision on Solana\n\n💼 **Your Wallet**\n📍 Address: `{walletAddress}`\n💰 Balance: {solBalance} SOL ({usdValue})\n\n📋 **What you can do:**\n• 📊 View trending pools\n• 💼 Manage your portfolio\n• 🔄 Create and manage positions\n• 💰 Track your earnings\n\nUse the menu below to get started! 👇",
        parseMode: 'Markdown'
      },
      welcomeReturning: {
        template: "👋 **Welcome back!**\n\n💼 **Your Wallet**\n📍 Address: `{walletAddress}`\n💰 Balance: {solBalance} SOL ({usdValue})\n\n📋 **Quick Actions:**\n• 📊 View trending pools\n• 💼 Check your portfolio\n• 🔄 Manage positions\n\nUse the menu below! 👇",
        parseMode: 'Markdown'
      },
      referralSuccess: {
        text: "🎉 Welcome! You've been referred by a friend and earned 50 bonus points!",
        parseMode: 'Markdown'
      },
      referralInvalid: {
        text: "⚠️ Invalid or expired referral code",
        parseMode: 'Markdown'
      },
      referralAlreadyUsed: {
        text: "ℹ️ You've already used a referral code.",
        parseMode: 'Markdown'
      }
    },
    
    trending: {
      fetching: {
        text: "🔍 Fetching trending tokens...",
        parseMode: 'Markdown'
      },
      noResults: {
        text: "❌ No trending tokens found at the moment. Please try again later.",
        parseMode: 'Markdown'
      },
      error: {
        text: "⚠️ Error fetching trending tokens. Please try again later.",
        parseMode: 'Markdown'
      }
    },
    
    portfolio: {
      loading: {
        text: "📊 Loading Portfolio...",
        parseMode: 'Markdown'
      },
      empty: {
        text: "❌ No active positions found.\n\nStart by exploring trending pools or paste a pool link to create your first position!",
        parseMode: 'Markdown'
      },
      noWallet: {
        text: "❌ No wallet connected. Please use /start to connect your wallet first.",
        parseMode: 'Markdown'
      }
    },
    
    wallet: {
      loading: {
        text: "⏳ *Wallet Still Creating*\n\nYour wallet is being set up. Please wait a moment and try again.\n\nIf this persists, please contact support.",
        parseMode: 'Markdown'
      },
      balance: {
        template: "💼 **Your Wallet**\n📍 Address: `{walletAddress}`\n💰 Balance: {solBalance} SOL ({usdValue})",
        parseMode: 'Markdown'
      }
    },
    
    help: {
      main: {
        text: "🤖 **Meteora Liquidity Bot Help**\n\n📋 **Available Commands:**\n• `/start` - Initialize your wallet and get started\n• `/trending` - View trending liquidity pools\n• `/portfolio` - Check your positions and earnings\n• `/wallet` - Manage your wallet and transfers\n• `/settings` - Configure bot preferences\n• `/help` - Show this help message\n\n🔗 **Quick Actions:**\n• Paste any pool link to view details\n• Use inline keyboards for easy navigation\n• All transactions are secure and encrypted\n\n💡 **Need Support?**\nJoin our community or contact support for assistance.",
        parseMode: 'Markdown'
      }
    }
  },
  
  errors: {
    generic: {
      text: "❌ Something went wrong. Please try again later."
    },
    network: {
      text: "❌ Network error. Please check your connection and try again."
    },
    timeout: {
      text: "⏱️ Request timed out. Please try again."
    },
    maintenance: {
      text: "🔧 Bot is under maintenance. Please try again later."
    },
    unauthorized: {
      text: "❌ You are not authorized to perform this action."
    },
    invalidInput: {
      text: "❌ Invalid input. Please try again."
    },
    missingRequired: {
      text: "❌ Required information is missing."
    },
    formatError: {
      text: "❌ Please check the format and try again."
    },
    poolNotFound: {
      text: "❌ Pool not found."
    },
    positionNotFound: {
      text: "❌ Position not found."
    },
    walletNotFound: {
      text: "❌ No wallet address found"
    },
    transactionFailed: {
      template: "❌ Transaction failed: {reason}"
    },
    insufficientBalance: {
      text: "❌ Insufficient balance for this transaction."
    },
    userNotFound: {
      text: "❌ User not found. Please use /start first."
    },
    authenticationFailed: {
      text: "❌ Authentication failed"
    },
    twoFactorRequired: {
      text: "❌ Two-factor authentication is required for this action."
    },
    invalidCode: {
      text: "❌ Invalid verification code."
    },
    tooManyAttempts: {
      text: "❌ Too many failed attempts. Please try again later."
    }
  },
  
  ui: {
    loading: {
      generic: {
        text: "⏳ Processing your request..."
      },
      fetchingData: {
        text: "📊 Fetching data..."
      },
      updating: {
        text: "🔄 Updating..."
      },
      connecting: {
        text: "🔗 Connecting..."
      },
      calculating: {
        text: "🧮 Calculating..."
      },
      poolDetails: {
        text: "⏳ Loading pool details..."
      },
      positionDetails: {
        text: "⏳ Loading position details..."
      },
      transaction: {
        text: "⏳ Building transaction... (Est. time: 10-30s)"
      },
      closing: {
        text: "⏳ **Closing position...**",
        parseMode: 'Markdown'
      },
      claiming: {
        text: "⏳ **Claiming fees...**",
        parseMode: 'Markdown'
      },
      rebalancing: {
        template: "⏳ **Rebalancing position...**",
        parseMode: 'Markdown'
      },
      transferring: {
        text: "⏳ Processing transfer..."
      },
      exporting: {
        text: "🔐 Exporting private key..."
      },
      tokenInfo: {
        text: "⏳ Looking up token information..."
      }
    },
    
    success: {
      generic: {
        text: "✅ Operation completed successfully!"
      },
      positionCreated: {
        template: "🎉 **Position Created Successfully!**\n\n📊 **Transaction**: {txLink}\n\n💡 Use /portfolio to view and manage your positions.",
        parseMode: 'Markdown'
      },
      positionClosed: {
        template: "✅ **Position Closed**\n\n📊 **Transaction**: {txLink}\n💰 **Final Value**: {finalValue}\n📈 **Total PnL**: {pnl}",
        parseMode: 'Markdown'
      },
      feesClaimed: {
        template: "✅ **Fees Claimed Successfully**\n\n💰 **Amount**: {amount}\n📊 **Transaction**: {txLink}\n\n📈 **Updated Position**:\n{positionSummary}",
        parseMode: 'Markdown'
      },
      positionRebalanced: {
        template: "✅ **Position Rebalanced Successfully**\n\n📊 **Transaction**: {txLink}\n🔄 **New Range**: {newRange}\n💰 **Current Value**: {currentValue}",
        parseMode: 'Markdown'
      },
      transferComplete: {
        template: "✅ **Transfer Successful**\n\n💰 **Amount**: {amount}\n📍 **To**: `{recipientAddress}`\n📊 **Transaction**: {txLink}",
        parseMode: 'Markdown'
      },
      transferCancelled: {
        text: "✅ Transfer cancelled."
      },
      exportComplete: {
        text: "✅ **Private Key Exported Successfully!**\n\n⚠️ **Important Security Reminder:**\nNever share your private key with anyone. Store it securely offline.",
        parseMode: 'Markdown'
      },
      exportCancelled: {
        text: "✅ Private key export cancelled."
      },
      twoFactorEnabled: {
        text: "✅ **Two-Factor Authentication Enabled Successfully!**\n\n🔒 Your account is now more secure.\n\n⚠️ **Important Reminders:**\n• Keep your authenticator app safe\n• Save backup codes in a secure location\n• 2FA is required for sensitive operations",
        parseMode: 'Markdown'
      },
      twoFactorDisabled: {
        text: "✅ Two-Factor Authentication has been disabled.",
        parseMode: 'Markdown'
      },
      settingsUpdated: {
        text: "✅ Settings updated successfully!"
      }
    }
  },
  
  callbacks: {
    buttonNotForYou: {
      text: "❌ This button is not for you."
    },
    expiredAction: {
      text: "❌ This action has expired. Please try again."
    },
    refreshed: {
      text: "🔄 Refreshed"
    },
    alreadyUpToDate: {
      text: "✅ Already up-to-date"
    },
    invalidData: {
      text: "❌ Invalid callback data."
    },
    invalidFormat: {
      text: "❌ Invalid callback data format."
    },
    invalidChatId: {
      text: "❌ Invalid chat ID."
    },
    processing: {
      text: "⏳ Processing..."
    },
    cancelled: {
      text: "✅ Cancelled"
    },
    confirmed: {
      text: "✅ Confirmed"
    },
    backToOverview: {
      text: "Back to overview"
    },
    closed: {
      text: "✅ Closed"
    },
    alreadyAtFirstPage: {
      text: "Already at first page"
    },
    alreadyAtLastPage: {
      text: "Already at last page"
    },
    readyToVerify: {
      text: "✅ Ready to verify! Please enter your 6-digit code."
    },
    verificationRequired: {
      text: "🔄 Verification required"
    }
  },
  
  twoFactor: {
    menu: {
      text: "🔐 **Two-Factor Authentication**\n\nSecure your account with an additional layer of protection.\n\n**Status**: {status}\n\nChoose an option below:",
      parseMode: 'Markdown'
    },
    alreadyEnabled: {
      text: "⚠️ **Two-Factor Authentication is already enabled!**\n\nYour account is already protected with 2FA. You can disable it or check status using the menu below.",
      parseMode: 'Markdown'
    },
    notEnabled: {
      text: "❌ **Two-Factor Authentication is not enabled.**\n\nEnable 2FA to secure your account and protect sensitive operations like wallet exports.",
      parseMode: 'Markdown'
    },
    setup: {
      template: "🔐 **Set Up Two-Factor Authentication**\n\n1️⃣ Install an authenticator app (Google Authenticator, Authy, etc.)\n2️⃣ Scan this QR code:\n\n{qrCode}\n\n3️⃣ Or manually enter this key:\n`{secretKey}`\n\n4️⃣ Enter the 6-digit code from your app to verify setup.\n\n⚠️ **Important:**\n• Save your secret key in a secure location\n• You'll need your authenticator for sensitive operations",
      parseMode: 'Markdown'
    },
    readyToVerify: {
      text: "✅ **Ready to Verify!**\n\nPlease enter the 6-digit code from your authenticator app to complete setup.",
      parseMode: 'Markdown'
    },
    enabledSuccess: {
      text: "✅ **Two-Factor Authentication Enabled Successfully!**\n\n🔒 Your account is now more secure.\n\n⚠️ **Important Reminders:**\n• Keep your authenticator app safe\n• Save backup codes in a secure location\n• 2FA is required for sensitive operations",
      parseMode: 'Markdown'
    },
    invalidCode: {
      text: "❌ **Invalid verification code!**\n\nPlease check your authenticator app and try again with the current 6-digit code.",
      parseMode: 'Markdown'
    },
    noSetupInProgress: {
      text: "❌ **No 2FA setup in progress!**\n\nPlease start the setup process first by selecting 'Enable 2FA' from the menu.",
      parseMode: 'Markdown'
    },
    disableConfirm: {
      text: "⚠️ **Disable Two-Factor Authentication**\n\nAre you sure you want to disable 2FA? This will make your account less secure.\n\n🔒 **Current Protection:**\n• Wallet export protection\n• Transfer confirmation\n• Settings modification protection",
      parseMode: 'Markdown'
    },
    status: {
      template: "🔐 **Two-Factor Authentication Status**\n\n**Status**: {status}\n**Last Updated**: {lastUpdated}\n\n{statusDetails}",
      parseMode: 'Markdown'
    },
    requiredForExport: {
      text: "🔐 **Two-Factor Authentication Required**\n\n⚠️ **Why 2FA is required:**\n• Protects your private key from unauthorized access\n• Ensures only you can export wallet information\n• Industry standard security practice\n\nPlease enable 2FA first, then try exporting again.",
      parseMode: 'Markdown'
    },
    verificationRequired: {
      text: "🔐 **2FA Verification Required**\n\n🔄 You have 3 attempts remaining\n\nPlease enter your 6-digit authentication code to continue.",
      parseMode: 'Markdown'
    },
    tooManyAttempts: {
      text: "❌ **Too Many Failed Attempts**\n\nFor security reasons, please wait before trying again.\n\nIf you're having trouble, please contact support.",
      parseMode: 'Markdown'
    },
    invalidCodeWithAttempts: {
      template: "❌ **Invalid verification code!**\n\n🔄 Attempts remaining: {remainingAttempts}\n\nPlease check your authenticator app and try again.",
      parseMode: 'Markdown'
    }
  },
  
  wallet: {
    export: {
      firstTimeWarning: {
        text: "⚠️ **First Time Export Warning**\n\n🔐 **Security Notice:**\nYou're about to export your private key for the first time.\n\n**Important:**\n• Never share your private key with anyone\n• Store it securely offline\n• Anyone with this key can access your funds\n\nDo you want to continue?",
        parseMode: 'Markdown'
      },
      success: {
        template: "✅ **Private Key Exported Successfully!**\n\n⚠️ **Important Security Reminder:**\nNever share your private key with anyone. Store it securely offline.\n\n🔐 **Your Private Key:**\n`{privateKey}`\n\n📍 **Wallet Address:**\n`{walletAddress}`",
        parseMode: 'Markdown'
      },
      cancelled: {
        text: "✅ Private key export cancelled."
      }
    },
    
    transfer: {
      solRequest: {
        text: "💰 **Transfer SOL**\n\nPlease enter the recipient's wallet address:",
        parseMode: 'Markdown'
      },
      allSolRequest: {
        text: "💰 **Transfer All SOL**\n\nPlease enter the recipient's wallet address to transfer your entire SOL balance:",
        parseMode: 'Markdown'
      },
      tokenRequest: {
        text: "🪙 **Transfer Tokens**\n\nPlease enter the recipient's wallet address:",
        parseMode: 'Markdown'
      },
      allTokensRequest: {
        text: "🪙 **Transfer All Tokens**\n\nPlease enter the recipient's wallet address to transfer all your tokens:",
        parseMode: 'Markdown'
      },
      confirmation: {
        template: "💰 **Confirm Transfer**\n\n**Amount**: {amount}\n**To**: `{recipientAddress}`\n**Estimated Value**: {usdValue}\n**Network Fee**: ~{networkFee} SOL\n\n⚠️ **Please verify the recipient address carefully. This action cannot be undone.**",
        parseMode: 'Markdown'
      },
      success: {
        template: "✅ **Transfer Successful**\n\n💰 **Amount**: {amount}\n📍 **To**: `{recipientAddress}`\n📊 **Transaction**: {txLink}",
        parseMode: 'Markdown'
      },
      successWithAdjustment: {
        template: "✅ **Transfer Successful**\n\n💰 **Requested**: {requestedAmount}\n💰 **Actual**: {actualAmount}\n📍 **To**: `{recipientAddress}`\n📊 **Transaction**: {txLink}\n\nℹ️ Amount adjusted to cover network fees.",
        parseMode: 'Markdown'
      },
      error: {
        template: "❌ **Transfer Failed**\n\n**Error**: {error}\n\nPlease check your balance and try again."
      },
      processing: {
        text: "⏳ **Processing Transaction**\n\nYour transaction is being processed. Please wait a moment...\n\n_Please do not click the confirm button again to avoid duplicate transactions._",
        parseMode: 'Markdown'
      }
    }
  },
  
  pool: {
    details: {
      loading: {
        template: "⏳ Loading pool details for {poolName}...",
        parseMode: 'Markdown'
      },
      refreshing: {
        text: "⏳ Refreshing pool details..."
      },
      closing: {
        text: "✅ Closing pool details"
      },
      closed: {
        text: "Pool details closed.",
        parseMode: 'Markdown'
      },
      failedToClose: {
        text: "❌ Failed to close properly"
      }
    }
  },
  
  position: {
    details: {
      loading: {
        text: "⏳ Loading position details..."
      }
    },
    
    close: {
      confirmation: {
        template: "⚠️ **Confirm Position Close**\n\n**Position**: {positionName}\n**Current Value**: {currentValue}\n**Estimated PnL**: {estimatedPnl}\n\n**Are you sure you want to close this position?**\n\nThis action cannot be undone.",
        parseMode: 'Markdown'
      },
      processing: {
        text: "⏳ **Closing position...**",
        parseMode: 'Markdown'
      },
      success: {
        template: "✅ **Position Closed**\n\n📊 **Transaction**: {txLink}\n💰 **Final Value**: {finalValue}\n📈 **Total PnL**: {pnl}",
        parseMode: 'Markdown'
      }
    },
    
    claim: {
      confirmation: {
        template: "💰 **Confirm Fee Claim**\n\n**Position**: {positionName}\n**Claimable Fees**: {claimableAmount}\n**Estimated Value**: {estimatedValue}\n\n**Proceed with claiming fees?**",
        parseMode: 'Markdown'
      },
      processing: {
        text: "⏳ **Claiming fees...**",
        parseMode: 'Markdown'
      },
      success: {
        template: "✅ **Fees Claimed Successfully**\n\n💰 **Amount**: {amount}\n📊 **Transaction**: {txLink}\n\n📈 **Updated Position**:\n{positionSummary}",
        parseMode: 'Markdown'
      }
    },
    
    rebalance: {
      confirmation: {
        template: "🔄 **Confirm Rebalance**\n\n**Position**: {positionName}\n**Current Range**: {currentRange}\n**New Range**: {newRange}\n**Estimated Cost**: {estimatedCost}\n\n**Proceed with rebalancing?**",
        parseMode: 'Markdown'
      },
      processing: {
        template: "⏳ **Rebalancing position...**",
        parseMode: 'Markdown'
      },
      success: {
        template: "✅ **Position Rebalanced Successfully**\n\n📊 **Transaction**: {txLink}\n🔄 **New Range**: {newRange}\n💰 **Current Value**: {currentValue}",
        parseMode: 'Markdown'
      }
    },
    
    create: {
      summary: {
        template: "📋 **Position Summary**\n\n**Pool**: {poolName}\n**Strategy**: {strategy}\n**Amount**: {amount}\n**Price Range**: {priceRange}\n**Auto-rebalancing**: {autoRebalancing}\n**Estimated APY**: {estimatedApy}\n\n**Ready to create position?**",
        parseMode: 'Markdown'
      },
      building: {
        text: "⏳ Building transaction... (Est. time: 10-30s)",
        parseMode: 'Markdown'
      },
      success: {
        template: "🎉 **Position Created Successfully!**\n\n📊 **Transaction**: {txLink}\n💰 **Initial Value**: {initialValue}\n📈 **Estimated APY**: {estimatedApy}\n\n💡 Use /portfolio to view and manage your positions.",
        parseMode: 'Markdown'
      }
    }
  },
  
  settings: {
    vaultAddress: {
      text: "🔑 Please enter your new vault address."
    },
    gasPriority: {
      text: "⛽ Please select your desired gas priority fee."
    },
    rebalanceSchedule: {
      text: "🕒 Please choose your rebalancing schedule."
    },
    unknownAction: {
      text: "Unknown action"
    }
  },
  
  system: {
    privateChatRequired: {
      text: "❌ Please start the bot in a private chat with me."
    },
    processing: {
      text: "⏳ Processing your request..."
    },
    comingSoon: {
      text: "Coming soon..."
    },
    maintenance: {
      text: "🔧 Bot is under maintenance. Please try again later."
    }
  }
};

// Export individual categories for easier imports
export const COMMAND_MESSAGES = MESSAGES.commands;
export const ERROR_MESSAGES = MESSAGES.errors;
export const UI_MESSAGES = MESSAGES.ui;
export const CALLBACK_MESSAGES = MESSAGES.callbacks;
export const TWO_FACTOR_MESSAGES = MESSAGES.twoFactor;
export const WALLET_MESSAGES = MESSAGES.wallet;
export const POOL_MESSAGES = MESSAGES.pool;
export const POSITION_MESSAGES = MESSAGES.position;
export const SETTINGS_MESSAGES = MESSAGES.settings;
export const SYSTEM_MESSAGES = MESSAGES.system;