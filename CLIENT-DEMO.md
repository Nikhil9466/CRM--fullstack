# Bring your CRM live after restarting

1. Start your PC, sign in to your normal Linux account, and connect to the internet.
2. Open Terminal with **Ctrl + Alt + T**.
3. Paste this command and press Enter:

   ```bash
   bash /home/nagender/Desktop/CRM/start-client-demo.sh
   ```

4. Wait for **Your CRM is live**. Copy the link printed below it and send that link to your client.
5. Open the link and use an existing CRM account. This demo uses your existing CRM data; changes affect that data.

The starter finds the current public link and sets up the matching secure login automatically. Use the link it prints each time. You can close Terminal and Codex after it starts. Keep the PC awake and connected to the internet. Shutting down or signing out stops the demo. It starts only when you run the start command.

To stop public access when you finish:

```bash
bash /home/nagender/Desktop/CRM/stop-client-demo.sh
```

If you also want the usual local page on port 4000, open another terminal and run:

```bash
cd /home/nagender/Desktop/CRM
npm start
```

Then open http://localhost:4000. The client demo runs independently on port 4001.

If starting the demo fails, check your internet connection and retry the start command. The terminal prints the demo log if it cannot connect. PostgreSQL is already enabled to start on this PC.

If the log asks you to sign in to GitHub again, run:

```bash
/usr/share/code/bin/code-tunnel tunnel user login --provider github
```

Follow its browser sign-in instructions, then rerun the start command. You do not need to share your password in chat.
