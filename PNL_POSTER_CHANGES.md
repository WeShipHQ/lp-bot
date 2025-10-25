# PNL Poster Enhancement Summary

## Overview
Enhanced the Weisheep poster service to generate and display PNL (Profit & Loss) cards when users close their liquidity positions.

## Changes Made

### 1. Enhanced WeisheepPosterService (`src/services/weisheep-poster.service.ts`)
- Added `PnlPosterInput` type for PNL-specific poster generation
- Created `generatePnlPoster` function with:
  - Dynamic background selection (green for profit, red for loss)
  - Large PNL display with color coding
  - Grid layout showing position details
  - Professional formatting with proper fonts

### 2. Updated TransactionConfirmWorker (`src/infrastructure/jobs/workers/transaction-confirm.worker.ts`)
- Modified `buildClosePositionNotifications` to be async
- Added PNL poster generation using position data
- Integrated with position repository to fetch complete position info
- Added proper error handling with fallback to text-only notifications

### 3. Extended Notification System
- Updated `NotificationMessagePayload` to support photo messages
- Enhanced `NotificationService` to handle both text and photo messages
- Added proper caption support for photo messages

## Features

### Dynamic Background Selection
- Profit (PNL >= 0): Uses `template-flex.png` (green theme)
- Loss (PNL < 0): Uses `template-flex-3.png` (red theme)

### Information Displayed
- **PNL Amount**: Large, prominent display with dollar sign
- **PNL Percentage**: Secondary display below main amount
- **Trading Pair**: Token pair (e.g., SOL-USDC)
- **DEX Platform**: Meteora, Saros, etc.
- **Initial Value**: Starting position value
- **Final Value**: Ending position value
- **Fees Claimed**: Total fees earned
- **Duration**: Position lifetime in days
- **Position Address**: Truncated for readability

## Technical Implementation

### Color Coding
- Green (#22C55E) for profits
- Red (#EF4444) for losses
- White (#FFFFFF) for neutral text
- Semi-transparent white for labels

### Error Handling
- Graceful fallback to text-only notifications if poster generation fails
- Comprehensive logging for debugging
- Proper exception handling with meaningful error messages

## Integration Points

1. **Position Closure Flow**: When a position close transaction is confirmed, the worker:
   - Fetches complete position data
   - Calculates duration and other metrics
   - Generates PNL poster image
   - Sends photo message with caption

2. **Notification Delivery**: The enhanced notification service:
   - Detects photo messages
   - Sends image with optional caption
   - Maintains existing text message functionality

## Usage

The PNL poster is automatically generated and sent when:
1. A user closes a liquidity position
2. The transaction is confirmed on-chain
3. The position data is available in the database

The poster provides an immediate, visual summary of the position's performance, making it easy for users to understand their trading results at a glance.