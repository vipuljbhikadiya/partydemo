# Bingo PartyKit Server

A real-time multiplayer bingo game server built with PartyKit and Cloudflare Workers.

## Features

- Real-time multiplayer support using PartyKit
- Scalable architecture with Cloudflare Workers
- Hibernation mode for efficient resource usage
- TypeScript support

## Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- Cloudflare account
- Git

## Development Workflow

### 1. Clone and Setup

bash
Clone the repository
git clone git@github.com:vipuljbhikadiya/partydemo.git
Navigate to project directory
cd bingo-partyserver
Install dependencies
npm install

### 2. Branch Creation

bash
Fetch latest changes
git fetch origin
git checkout main
git pull origin main
Create a new branch for your issue
git checkout -b feature/ISSUE-123-short-description
or
git checkout -b fix/ISSUE-123-bug-description

### 3. Development Process

bash
Start development server
npm run dev
Run tests
npm run test

### 4. Commit Changes

bash
Stage your changes
git add .
Commit with a descriptive message
git commit -m "feat: add multiplayer support for bingo cards
Added websocket handlers
Implemented game state management
Added tests for multiplayer features
Fixes #123"

### 5. Create Pull Request

bash
Push your branch
git push origin feature/ISSUE-123-short-description
Then create a PR on GitHub:

1. Go to https://github.com/yourusername/bingo-partyserver
2. Click 'Pull Requests' > 'New Pull Request'
3. Select your branch
4. Fill in the PR template

### PR Guidelines

- Link the related issue(s)
- Add meaningful description
- Include test coverage
- Update documentation if needed
- Request review from team members

## Installation (for users)

bash
npm install
