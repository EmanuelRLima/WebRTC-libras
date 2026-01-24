# WebRTC-libras
WebRTC-libras

Setup Instructions

1. Clone the repository:
   ```bash
   git clone

    cd WebRTC-libras
    ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
    cd server/
    npm install
    node server.js
    ```
4. Open your browser and navigate to `http://localhost:3000` to access the application.

5. If you want run on a smartphone, do you need a ngrok or similar tool to expose your localhost to the internet.

    ```bash
    npm install -g ngrok
    register on ngrok.com to get your auth token
    ngrok config add-authtoken YOUR_AUTH_TOKEN
    ngrok http 3000
    ```

Enjoy using WebRTC-libras!