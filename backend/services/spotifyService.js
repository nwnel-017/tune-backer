require("dotenv").config();
const axios = require("axios");
const supabase = require("../utils/supabase/supabaseClient");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("../utils/crypto");

async function exchangeCodeForToken(code) {
  try {
    const tokenRes = await fetch(`${process.env.SPOTIFY_TOKEN_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json(); // spotify access tokens

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken || !refreshToken) {
      throw new Error("Tokens came back empty from spotify!");
    }

    // 3. retrieve spotify profile to get user id
    let spotifyProfile;
    try {
      const profileRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      spotifyProfile = await profileRes.json();
    } catch (error) {
      console.error("Error fetching Spotify profile:", error);
      throw new Error("Failed to fetch Spotify profile");
    }

    const spotifyId = spotifyProfile.id;

    return {
      accessToken,
      refreshToken,
      spotifyId,
      expiresAt: new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString(),
    };
  } catch (error) {
    console.log("Error exchanging and storing tokens: " + error);
  }
}

async function handleOAuth(code, parsedState) {
  const tokens = await exchangeCodeForToken(code); // returns access and refresh tokens
  const spotifyId = await getSpotifyId(tokens.accessToken); // retrieve spotify id

  if (!tokens.accessToken || !tokens.refreshToken || !spotifyId) {
    console.log("missing tokens or spotify id in handleOAuth!");
    throw new Error("Missing tokens!");
  }

  if (parsedState.flow === "login") {
    return loginWithSpotify(spotifyId, tokens); // searches for existing user - upserts tokens - logs in
  } else if (parsedState.flow === "link") {
    return linkSpotifyAccount(parsedState.nonce, spotifyId, tokens);
  } else if (parsedState.flow === "restore") {
    return restorePlaylist(
      parsedState.nonce,
      parsedState.playlistId,
      spotifyId,
      tokens
    );
  } else if (parsedState.flow === "fileRestore") {
    return restorePlaylistFromStorage(parsedState.nonce, spotifyId, tokens);
  } else {
    throw new Error("Invalid flow");
  }
}

async function unlinkSpotifyAccount(userId) {
  if (!userId) {
    throw new Error("Missing user ID for unlinking Spotify account");
  }

  const { error } = await supabase
    .from("spotify_users")
    .delete()
    .eq("user_id", userId);

  // mark active flag in weekly_backups as false for all playlists
  const { error: updateError } = await supabase
    .from("weekly_backups")
    .update({ active: false })
    .eq("user_id", userId);

  if (updateError) {
    console.error("Error disabling weekly backups:", updateError);
    throw new Error("Failed to deactivate weekly backups");
  }

  if (error) {
    console.error("Error unlinking Spotify account:", error);
    throw new Error("Failed to unlink Spotify account");
  }
}

async function restorePlaylistFromStorage(nonce, spotifyId, tokens) {
  const { accessToken } = tokens;
  if (!nonce || !spotifyId || !accessToken) {
    throw new Error("Error: Missing tokens!");
  }

  try {
    const { data } = await supabase
      .from("file_restore_nonces")
      .select("*")
      .eq("nonce", nonce)
      .single();

    if (!data) {
      throw new Error("Failed to get nonce from database!");
    }

    const path = data.storage_path;
    const playlistName = data.playlist_name;

    // use nonce to retrieve playlist from storage
    const { data: file } = await supabase.storage
      .from("playlist_files")
      .download(`${path}`);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = buffer.toString("utf-8");

    const json = JSON.parse(text);
    const trackIds = json.trackIds;

    // clean up database
    await supabase.storage.from("playlist_files").remove(`${path}`);
    await supabase.from("file_restore_nonces").delete().eq("nonce", nonce);

    // restore new playlist
    await createAndFillPlaylist(accessToken, spotifyId, playlistName, trackIds);
  } catch (error) {
    throw new Error("Error: " + error);
  }
}

async function loginWithSpotify(spotifyId, tokens) {
  const { accessToken, refreshToken, expiresAt } = tokens;

  // we have all these correct
  if (!accessToken || !refreshToken || !expiresAt) {
    throw new Error("Missing tokens in loginWithSpotify!");
  }

  const { data: existing, error: findError } = await supabase
    .from("spotify_users")
    .select("user_id")
    .eq("spotify_user", spotifyId)
    .single();

  if (findError || !existing) {
    throw new Error("No Supabase user linked to this Spotify account");
  }

  const encryptedAccess = crypto.encrypt(accessToken);
  const encryptedRefresh = crypto.encrypt(refreshToken);

  // Upsert new tokens
  const { error: upsertError } = await supabase.from("spotify_users").upsert(
    {
      user_id: existing.user_id,
      spotify_user: spotifyId,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: expiresAt,
    },
    { onConflict: ["user_id"] }
  );

  if (upsertError) throw upsertError;

  // At this point we have supabase Id -> we now need to create a session
  const { access_token, refresh_token } = generateTokens(existing.user_id);

  if (!access_token || !refresh_token) {
    console.log("Error creating new session in loginWithSpotify!");
    throw new Error("Error: failed to create a session!");
  }

  return { access_token, refresh_token };
}

async function restorePlaylist(nonce, playlistId, spotifyId, tokens) {
  const { accessToken, refreshToken, expiresAt } = tokens;

  if (
    !accessToken ||
    !refreshToken ||
    !expiresAt ||
    !nonce ||
    !spotifyId ||
    !playlistId
  ) {
    throw new Error("Missing required parameters!");
  }
  try {
    // Verify nonce
    const { data: linkRecord, error: linkError } = await supabase
      .from("spotify_nonces")
      .select("*")
      .eq("nonce", nonce)
      .single();

    if (linkError || !linkRecord) {
      throw new Error("Invalid or expired link request");
    }

    if (new Date(linkRecord.expires_at) < new Date()) {
      throw new Error("Link request has expired");
    }

    const supabaseUserId = linkRecord.user_id;

    // Clean up nonce
    await supabase.from("spotify_nonces").delete().eq("nonce", nonce);

    const { playlistName, trackIds } = await retrieveTracksAndName(
      supabaseUserId,
      playlistId
    );

    await createAndFillPlaylist(accessToken, spotifyId, playlistName, trackIds);
  } catch (error) {
    console.log("Error during nonce validation: " + error);
    throw new Error("Error validating nonce!");
  }
}

async function createAndFillPlaylist(
  accessToken,
  userId, // spotify user
  playlistName,
  trackIds
) {
  if (!playlistName || !trackIds || !accessToken || !userId) {
    console.log("Missing params in backup service!");
    throw new Error("Error in Service - missing params to create playlist");
  }
  try {
    const playlistId = await createNewPlaylist(
      accessToken,
      userId,
      playlistName
    );
    await addTracksToPlaylist(accessToken, playlistId, trackIds);
    console.log("Playlist successfully restored!");
  } catch (error) {
    throw new Error("Error creating the restored playlist: " + error.message);
  }
}

async function addTracksToPlaylist(accessToken, playlistId, trackIds) {
  if (!accessToken || !playlistId || !trackIds) {
    throw new Error("Error restoring tracks to the playlist - missing params!");
  }
  const batchSize = 100; // max amount of songs spotify allows adding

  for (let i = 0; i < trackIds.length; i += batchSize) {
    const curBatch = trackIds.slice(i, i + batchSize);
    const uris = curBatch.map((id) => `spotify:track:${id}`);

    try {
      await axios.post(
        `${process.env.SPOTIFY_API_BASE_URL}/playlists/${playlistId}/tracks`,
        {
          uris,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      console.error(
        "Spotify API error while adding tracks:",
        error.response
          ? JSON.stringify(error.response.data, null, 2)
          : error.message
      );
      throw new Error("Error adding tracks to playlist");
    }
  }
}

async function createNewPlaylist(accessToken, userId, playlistName) {
  if (!accessToken || !playlistName || !userId) {
    throw new Error("Missing playlist name!");
  }

  const now = new Date(Date.now());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const year = now.getFullYear();
  const formattedDate = `${month}/${day}/${year}`;

  const name = `${playlistName} - Restored ${formattedDate}`;

  try {
    const res = await axios.post(
      `${process.env.SPOTIFY_API_BASE_URL}/users/${userId}/playlists`,
      {
        name,
        description: "Restored by TuneBacker",
        public: false,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return res.data.id; // the new playlist id
  } catch (error) {
    console.error(
      "Spotify API error:",
      JSON.stringify(error.response.data, null, 2)
    );

    throw new Error("Error creating restored playlist: " + error.response.data);
  }
}

async function retrieveTracksAndName(userId, playlistId) {
  if (!userId || !playlistId) {
    throw new Error("Missing playlist id!");
  }

  const { data, error } = await supabase
    .from("weekly_backups")
    .select("playlist_id, playlist_name, backup_data")
    .eq("user_id", userId)
    .eq("playlist_id", playlistId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows found
      console.log("No rows found in weeky_backups!");
      return res
        .status(404)
        .json({ message: "No backup found for this playlist" });
    }
    throw error;
  }
  const playlistName = data.playlist_name;
  const trackIds = (data.backup_data || []).map((track) => track.id);

  if (!trackIds) {
    throw new Error("Failed to map trackIds!");
  }

  return { playlistName, trackIds };
}

async function buildOAuthUrl({
  flow,
  playlistId,
  playlistName = "",
  trackIds = null,
  userId,
}) {
  const scope = process.env.SPOTIFY_OAUTH_SCOPES || "";

  let statePayload;

  if (flow === "restore") {
    if (!playlistId || !userId) {
      throw new Error("Error: must have playlist id and user id to restore!");
    }
    const nonce = crypto.generateNonce();
    const { error } = await supabase.from("spotify_nonces").upsert({
      nonce,
      user_id: userId,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });

    if (error) {
      console.log("Error inserting nonce: " + error);
      throw new Error("Error inserting nonce into database: " + error.message);
    }

    statePayload = { flow, nonce, playlistId };
  } else if (flow === "fileRestore") {
    if (!userId || !playlistName || !trackIds) {
      throw new Error("Missing userId or playlistName!");
    }
    try {
      const nonce = crypto.generateNonce();
      const filePath = `restores/${nonce}.json`;
      await supabase.storage
        .from("playlist_files")
        .upload(filePath, JSON.stringify({ trackIds }), {
          contentType: "application/json",
        });

      await supabase.from("file_restore_nonces").upsert({
        nonce,
        user_id: userId,
        storage_path: filePath,
        playlist_name: playlistName,
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      });
      statePayload = { flow, nonce };
    } catch (error) {
      console.log("Error building OAuth URL: " + error);
      throw new Error("Error building OAuth URL: " + error);
    }
  } else if (flow === "link") {
    if (!userId) {
      throw new Error("Error: must have user id to link!");
    }
    const nonce = crypto.generateNonce();
    const { error } = await supabase.from("spotify_nonces").upsert({
      nonce,
      user_id: userId,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });

    if (error) {
      throw new Error("Error inserting nonce into supabase: " + error.message);
    }

    statePayload = { flow, nonce };
  } else if (flow === "login") {
    // implement this!
    statePayload = { flow };
  } else {
    throw new Error("Invalid flow!");
  }

  const queryParams = new URLSearchParams({
    response_type: "code",
    scope: scope,
    redirect_uri: process.env.REDIRECT_URI,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    show_dialog: "true",
    state: JSON.stringify(statePayload), // Either contains supabase session or null depending on whether we are logging in / linking account
  });

  return `https://accounts.spotify.com/authorize?${queryParams}`;
}

async function linkSpotifyAccount(nonce, spotifyId, tokens) {
  const { accessToken, refreshToken, expiresAt } = tokens;

  if (!accessToken || !refreshToken || !expiresAt) {
    throw new Error("Missing tokens!");
  }

  // Verify nonce
  const { data: linkRecord, error: linkError } = await supabase
    .from("spotify_nonces")
    .select("*")
    .eq("nonce", nonce)
    .single();

  if (linkError || !linkRecord) {
    console.log("error verifying nonce: " + linkError.message);
    throw new Error("Invalid or expired link request");
  }

  if (new Date(linkRecord.expires_at) < new Date()) {
    throw new Error("Link request has expired");
  }

  // Clean up nonce
  await supabase.from("spotify_nonces").delete().eq("nonce", nonce);

  const encryptedAccess = crypto.encrypt(tokens.accessToken);
  const encryptedRefresh = crypto.encrypt(tokens.refreshToken);

  // Store tokens against the Supabase user
  const { error: upsertError } = await supabase.from("spotify_users").upsert(
    {
      user_id: linkRecord.user_id,
      spotify_user: spotifyId,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: expiresAt,
    },
    { onConflict: ["user_id"] }
  );

  if (upsertError) throw upsertError;

  return { success: true };
}

async function getSpotifyId(accessToken) {
  const profileRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    const err = await profileRes.json();
    throw new Error("Failed to fetch Spotify profile: " + JSON.stringify(err));
  }

  const profile = await profileRes.json();
  if (!profile.id) {
    throw new Error("Error retrieving id from spotify profile!");
  }
  return profile.id;
}

// refresh token for spotify api
// takes in a decrypted refresh token
async function refreshSpotifyToken(refreshToken, clientId, clientSecret) {
  console.log("Reached refreshSpotifyToken in service");

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Missing parameters!");
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const tokenUrl = process.env.SPOTIFY_TOKEN_URL || "";

  try {
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authString}`,
        },
      }
    );

    return response; // Contains new access_token and possibly a new refresh_token
  } catch (error) {
    console.error(
      "Error in spotify api call to refresh access token:",
      error.response?.data || error.message
    );
    throw error;
  }
}

async function getPlaylistTracks(accessToken, playlistId) {
  const limit = 100; // Spotify's max per request
  let offset = 0;
  let allTracks = [];
  // need to add song ID here
  try {
    while (true) {
      const response = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { limit, offset },
        }
      );

      const items = response.data.items.map((item) => ({
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists.map((a) => a.name).join(", "),
        album: item.track.album.name,
        added_at: item.added_at,
      }));

      allTracks = allTracks.concat(items);

      // If we got fewer than `limit` items, we’re done
      if (response.data.items.length < limit) break;

      offset += limit;
    }

    return allTracks;
  } catch (error) {
    console.error(
      "Error fetching playlist tracks:",
      error.response?.data || error.message
    );
    throw {
      status: error.response?.status || 500,
      message: error.response?.data || "Failed to fetch playlist tracks",
    };
  }
}

async function getPlaylists(accessToken, offset = 0, limit = 50) {
  try {
    const response = await axios.get(
      "https://api.spotify.com/v1/me/playlists",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { offset, limit },
      }
    );

    // testing - check if we've hit spotify's rate limits
    if (response.status === 429) {
      console.log("Hit spotifys rate limits!!!!");
    }

    return response.data;
  } catch (error) {
    console.error("Spotify API error:", error.response?.data || error.message);
    throw {
      status: error.response?.status || 500,
      message: error.response?.data || "Failed to fetch playlists",
    };
  }
}

async function getProfileInfo(accessToken) {
  if (!accessToken) {
    throw new Error("Missing access token");
  }
  try {
    const response = await axios.get(`${process.env.SPOTIFY_API_BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`, // attach token
      },
    });
    return response.data; // Spotify returns user object here
  } catch (error) {
    console.error("Spotify API error:", error.response?.data || error.message);
    throw new Error("Failed to fetch profile info from Spotify");
  }
}

module.exports = {
  exchangeCodeForToken,
  handleOAuth,
  buildOAuthUrl,
  getPlaylistTracks,
  getPlaylists,
  getProfileInfo,
  refreshSpotifyToken,
  unlinkSpotifyAccount,
};
