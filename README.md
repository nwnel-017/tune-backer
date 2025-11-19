Welcome to TuneBacker! My app is live at https://www.tunebacker.cc
======================================================================

NOTE: As of March 2025, Spotify only approves legal entities with a minimum of 25,000 users to use their OAuth publicly. Because of this, my app is still in development mode. Authentication through Spotify
is only available for Spotify accounts I specifically whitelist (up to 25 users) through Spotify's developer dashboard. Right now my app is used by me and my close family / friends, but is not yet available for public use. 

***Important:***
<br>To test my app, I have created a whitelisted spotify account which you can use.
<br><br>
Email: testtunebacker@gmail.com<br>
Password: Testing123
<br><br>
You can create an account through TuneBacker (any email / password), and link it to the provided Spotify account with these credentials.
<br><br>
***My Tech Stack*** 
<br>-Frontend: React.js
<br>-Backend: Node.js, Express 
<br>-Database: Supabase, PostgreSQL
<br>-Deployment: Vercel, Render
<br><br>
TuneBacker is an app I designed to provide a way for spotify users to keep their playlists secure with weekly backups, with ability to restore playlists between accounts. My app also provides a way to download a playlist as a .csv file, which can be uploaded to any spotify account. This also allows an easy way for users to transfer playlists between accounts. 
<br><br>
***Features / UX***
<br>First, make an account through TuneBacker. TuneBacker will generate a temporary JWT token and use Resend js to send a verification email. Once the email is verified, TuneBacker will prompt the user to link their account.
<br>When linking a Spotify account, a nonce is stored in the backend and the user is sent to Spotify's OAuth page. After verification, a code provided by Spotify is used to retrieve the users session from spotify, which is encrypted and stored in the database.
<br>From the dashboard, the user can view all of their playlists and select one to backup. Upon selection, they can choose to download a playlist snapshot as a .CSV file, or to backup the playlist weekly. When choosing to backup the playlist weekly, the weekly backup can be managed in the 'My Saved Playlists' page. All of these playlists are updated once a week via cron job. If the playlist cannot be found, then the weekly backup will stop, but the user still has access to the saved playlist to restore later.
<br>If the user selects to restore a playlist from the 'My Saved Playlists' page, they will be sent to Spotify's OAuth page. The user can securely sign in to any Spotify account, and the playlist will be duplicated into the account.
<br>If the user selects to restore a playlist from a file, they can choose a playlist snapshot they downloaded through TuneBacker, and recreate that playlist to a Spotify account.
<br><br>
***To Do:***
Right now TuneBacker is available as a MVP. If my app grows, I will rewrite the weekly backup functionality. Instead of using an in-memory cron job that manually updates all backups at once, I plan to change to an external queing system.
