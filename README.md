# Git Paid - GitHub Bounty Platform

This full-stack web application allows GitHub repository owners to create bounties on issues and incentivize developers to contribute fixes. Bounties are held in escrow using the **Radius SDK** for secure payment release upon completion.

## Features

- **GitHub OAuth Login**: Users authenticate via GitHub (OAuth) to use the platform with proper scopes (admin:repo_hook, repo, user:email).
- **Bounty Creation**: Repository owners can create a bounty for any open GitHub issue in their repos by funding an escrow.
- **Bounty Listing**: Open bounties are publicly listed for developers to browse.
- **Claiming Bounties**: Developers claim a bounty (locking it for others) and work on the issue.
- **Approval & Payment**: Once a fix is merged (issue closed), the repo owner approves and the escrowed funds are released to the developer via Radius.
- **Escrow Management**: Funds are held, released, or refunded using the Radius blockchain integration.
- **Per-Repository Webhooks**: Secure webhook management with unique secrets per repository for enhanced security and user isolation.
- **Automated Fund Release**: Webhooks trigger automatic fund release when issues are closed on GitHub.

## Tech Stack

- **Backend**: Node.js + Express, Passport (GitHub OAuth), Prisma (PostgreSQL ORM), Axios (for GitHub API calls).
- **Frontend**: Next.js (React) for server-side rendering, TailwindCSS for UI styling, Axios for API calls.
- **Database**: PostgreSQL (via Prisma schema & client) with models for Users, Bounties, and RepositoryWebhooks.
- **Blockchain Integration**: Radius SDK for blockchain-based escrow and payments using smart contracts.
- **Security**: Per-repository webhook secrets stored in database for secure webhook verification.
- **Deployment Targets**:
  - Frontend: Vercel (Next.js)
  - Backend: Railway or Render (Node.js service)
  - Database: Supabase or Railway PostgreSQL instance

## Getting Started

### Prerequisites
- **Node.js** and **npm** installed (Node.js >= 20.12 recommended for Radius SDK).
- A PostgreSQL database (local or cloud) for storing user and bounty data.
- A GitHub OAuth App set up (to obtain a Client ID and Client Secret).
- Radius API credentials for blockchain-based escrow (a testnet RPC endpoint and private key).

### Installation
1. **Clone the repository** and navigate to the project directory.

2. **Configure environment variables**: The application requires separate environment files for the backend and frontend, each with different configurations.

   **Backend**: Create a `.env` file in the backend directory with:
   ```bash
   # Database Configuration
   DATABASE_URL="postgresql://username:password@localhost:5432/gitpaid?schema=public"

   # Authentication
   JWT_SECRET="your-jwt-secret"
   GITHUB_CLIENT_ID="your-github-oauth-app-client-id"
   GITHUB_CLIENT_SECRET="your-github-oauth-app-client-secret"
   GITHUB_CALLBACK_URL="http://localhost:5000/auth/github/callback"

   # Frontend URL for redirects
   FRONTEND_URL="http://localhost:3000"

   # Radius Blockchain Configuration
   RADIUS_API_URL="https://rpc.testnet.tryradi.us/your-api-key"
   # Separate API keys for different roles
   RADIUS_BOUNTYLISTER_API_KEY="your-bountylister-private-key-without-0x-prefix"
   RADIUS_ESCROW_API_KEY="your-escrow-private-key-without-0x-prefix"
   # Addresses for the different roles
   RADIUS_ESCROW_ADDRESS="0x1234567890123456789012345678901234567890"
   RADIUS_BOUNTYLISTER_ADDRESS="0xE0726d13357eec32a04377BA301847D632D24646"
   RADIUS_BOUNTYHUNTER_ADDRESS="0x85EB3D12AfBFfA2Bf42EB0f070Df4AA60eF560Bc"
   ```
   
   **Frontend**: Create a `.env` file in the frontend directory with:
   ```bash
   # API Configuration
   NEXT_PUBLIC_API_BASE="http://localhost:5000"
   ```

3. **Install backend dependencies**:
   ```bash
   cd backend
   npm install
   npm install @radiustechsystems/sdk  # Install the Radius SDK
   ```
   
4. **Install frontend dependencies**:
   ```bash
   cd ../frontend
   npm install
   ```

5. **Set up the database**:
   - Update the `DATABASE_URL` in the `.env` with your Postgres connection string.
   - Run Prisma migrations to create tables:
     ```bash
     npx prisma migrate dev --name init
     ```
     This will create the `User` and `Bounty` tables as defined in `prisma/schema.prisma`.

### Running the Development Servers

**Backend** (Express API):
```bash
cd backend
npm run dev    # Starts the Express server on port 5000 (with nodemon)
```

**Frontend** (Next.js app):
```bash
cd frontend
npm run dev    # Starts the Next.js dev server on port 3000
```

### Database Schema

The application uses Prisma with the following main models:

- **User**: Stores GitHub user information and authentication tokens
- **Bounty**: Tracks bounties, their status, and associated GitHub issues
- **RepositoryWebhook**: Stores per-repository webhook configurations with unique secrets

The RepositoryWebhook model is crucial for security and proper webhook management, allowing each repository to have its own webhook endpoint with a unique secret.

Ensure the backend (http://localhost:5000) and frontend (http://localhost:3000) are running. The frontend is configured to call the backend API via `NEXT_PUBLIC_API_BASE`.

### Usage

1. Open the frontend in your browser: **http://localhost:3000**.  
2. Click "Login with GitHub". You will be redirected to GitHub to authorize the OAuth App. After authorizing, GitHub will redirect back to the app.
3. On successful login, you will land on the **Dashboard**:
   - **Dashboard**: Displays your posted bounties and any bounties you have claimed. From here you can navigate to:
     - **Create Bounty**: Fill in repository owner, repo name, issue number, and bounty amount to create a new bounty. The app will verify the issue via GitHub API and lock the funds via Radius.
     - **Browse Bounties**: View all open bounties posted by others. You can claim any open bounty which will assign it to you.
     - **Review**: (Visible to repo owners) See bounties you posted that have been claimed and are awaiting approval. Once you verify the issue is fixed (the GitHub issue is closed), you can release the funds to the developer.
   - **Logout**: Clears your session and token.

4. **Claiming a Bounty (Developer workflow)**:
   - Go to "Browse Bounties". A list of open issues with bounties (repository, issue number, amount) will be shown.
   - Click "Claim" on an issue you want to work on. The bounty will be marked as claimed (and no longer visible to others).
   - The platform (optionally) comments on the GitHub issue to indicate it's being worked on.
   - Work on the issue, submit a pull request on GitHub, and get it merged by the repo maintainer.

5. **Approving a Bounty (Repo owner workflow)**:
   - Once the issue is resolved/closed on GitHub, go to "Review" page on the platform.
   - You will see the list of your claimed bounties pending approval. Click "Release" to approve the solution.
   - The backend verifies the issue is closed via GitHub API, then calls the Radius API to release the escrowed funds to the developer.
   - The bounty status updates to **COMPLETED** and will no longer appear in active lists.

6. **Cancelling a Bounty**:
   - If a bounty needs to be withdrawn (no one has claimed it or the developer failed to deliver), the repo owner can cancel it. This triggers a refund via Radius back to the owner's account and marks the bounty as **CANCELLED**.
   - (In this app, cancellation is implemented via an API route, but no dedicated UI button is provided. It can be invoked with a proper API call if needed.)

### Project Structure

The repository is divided into a `backend` and `frontend` directory:
- **backend**: Node/Express server, OAuth authentication, API endpoints, database models (Prisma), and Radius blockchain integration.
- **frontend**: Next.js React application with pages for login, dashboard, creating/claiming bounties, and review. Uses Axios to communicate with the backend API.

Key backend files: 
- `controllers/` (`authController.js`, `bountyController.js`) implement the logic for auth and bounty actions.
- `routes/` (`authRoutes.js`, `bountyRoutes.js`) define the API endpoints.
- `models/` (`userModel.js`, `bountyModel.js`) define database interactions via Prisma.
- `config/` (`database.js`, `radius.js`) handle DB connection and blockchain integration with Radius SDK.
- `middleware/authMiddleware.js` protects routes using JWT authentication.
- `prisma/schema.prisma` describes the database schema for users and bounties.

Key frontend files:
- `pages/` (`index.js`, `dashboard.js`, `create-bounty.js`, `claim-bounty.js`, `review.js`, `auth/callback.js`) define the routes and main page components.
- `components/` (`Login.js`, `BountyList.js`, `CreateBountyForm.js`, `ClaimBounty.js`) are reusable UI components.
- `api/bounty.js` contains helper functions for calling backend API endpoints.
- Styling is done with TailwindCSS (see `styles/global.css` and Tailwind config).

### Radius SDK Integration

The application uses the Radius SDK for blockchain-based escrow functionality with separate API keys for different roles in the bounty process. The integration works as follows:

### Escrow Creation (On Bounty Creation)
When a repository owner creates a bounty, the funds are immediately transferred to an escrow account. This ensures that the funds are locked and available for the bounty winner.

1. The bounty creator submits the bounty details including the amount.
2. The application verifies the GitHub issue exists and is open.
3. The application creates an escrow transaction using the Radius SDK with the bounty lister's API key.
4. The funds are transferred from the bounty lister's account to the escrow account.
5. The bounty is created in the database with the escrow transaction ID.

### Escrow Release (On Bounty Completion)
When a GitHub issue associated with a bounty is closed, the funds are automatically released to the bounty hunter.

1. GitHub sends a webhook notification to the application when an issue is closed.
2. The application verifies the issue is closed and the bounty is claimed.
3. The application releases the funds from the escrow account (using the escrow API key) to the bounty hunter's address.
4. The bounty status is updated to COMPLETED in the database.

### Wallet Management Flow
The system uses three distinct wallets with separate API keys for enhanced security and role separation:

1. **Bounty Lister Wallet**: Used by repository owners to fund bounties. When creating a bounty, funds move from this wallet to the escrow wallet.
2. **Escrow Wallet**: Holds funds securely until a bounty is completed or cancelled. This wallet is controlled by the platform.
3. **Bounty Hunter Wallet**: Receives funds when a bounty is successfully completed.

This separation of concerns ensures proper fund management and security throughout the bounty lifecycle.cation verifies the webhook signature using the webhook secret.
3. The application checks if there's a bounty associated with the closed issue.
4. If the bounty is claimed, the application releases the funds from escrow to the claimer.
5. The bounty status is updated to "COMPLETED" in the database.

### Development Mode
During development, you can test the application with the Radius testnet to simulate blockchain interactions without using real funds.

### Production Setup
For production, you need to set up the following:

1. **Radius RPC Endpoint**: You can obtain a Radius testnet RPC endpoint from [Radius Testnet Access](https://docs.radiustech.xyz/radius-testnet-access).
2. **Ethereum Private Key**: You need an Ethereum private key for transaction signing. See [Ethereum Account Creation](https://ethereum.org/en/developers/docs/accounts/).
3. **Escrow and Bounty Addresses**: Configure the appropriate addresses for escrow and bounty management in your production environment.

### GitHub Webhook Setup

The application uses per-repository webhooks for enhanced security and user isolation. To enable automatic release of funds when issues are closed:

1. Go to your GitHub repository settings.
2. Navigate to "Webhooks" and click "Add webhook".
3. Set the Payload URL to `https://your-backend-url/webhooks/github/{owner}/{repo}` where `{owner}` is the repository owner and `{repo}` is the repository name.
4. Set the Content type to `application/json`.
5. Generate a unique secure webhook secret for each repository.
6. The application will store this secret in the database when you connect a repository through the UI.
7. Select "Let me select individual events" and choose only "Issues" events.
8. Make sure the webhook is active and click "Add webhook".

The webhook will notify the application when issues are closed, and the application will automatically release funds for bounties associated with those issues. Each repository has its own webhook endpoint with a unique secret, ensuring proper security isolation between repositories.

### Deployment

For production deployment, you can:
- Deploy the **frontend** to Vercel (import the project, set `NEXT_PUBLIC_API_BASE` to your API URL in Vercel environment settings).
- Deploy the **backend** to a service like Railway or Render. Set environment variables in the hosting platform for all keys in the `.env`.
- Provision a Postgres database (Railway, Supabase, etc.) and run the Prisma migrations. Update the `DATABASE_URL` accordingly in backend configuration.
- Ensure the OAuth callback URL in your GitHub OAuth App is updated to the production URL (e.g., `https://yourapp.com/auth/github/callback`).

### Notes

- **Error Handling**: The application includes basic error handling. For example, attempting to create a bounty on a non-existent issue or without sufficient permissions will return an error message. Ensure to handle such errors on the frontend (this demo shows error messages on forms).
- **Security**: JWT tokens are stored in `localStorage` for simplicity. In a production environment, consider using HTTP-only cookies or more secure token storage. Always protect sensitive routes (we use `ensureAuth` middleware for API protection).
- **Radius Blockchain Integration**: 
  - The app uses the official `@radiustechsystems/sdk` for all blockchain operations.
  - Escrow funds are managed through blockchain transactions secured by the Radius network.
  - For production use, you should deploy and use proper escrow smart contracts.
  - The implementation in `config/radius.js` provides the foundation for blockchain-based escrow but can be extended with more sophisticated smart contracts.
- **Improvement**: Implementing webhooks or periodic checks could automate moving bounties to "ready for payout" when an issue is closed, instead of relying on manual refresh.

Enjoy building and contributing to open-source with the GitHub Bounty Platform!
