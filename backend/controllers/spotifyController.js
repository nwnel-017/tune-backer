const spotifyService = require("../services/spotifyService");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { auth } = require("../utils/supabase/supabaseClient");

exports.search = async (req, res) => {
  try {
    const results = await spotifyService.searchTracks(req.query.q);
    ``;
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.loginWithSpotify = async (req, res) => {
  console.log("hit spotify login controller");
  try {
    const url = await spotifyService.buildOAuthUrl({ flow: "login" });
    res.json({ url });
  } catch (error) {
    throw new Error("Error creating login link: " + error);
  }
};

exports.linkSpotify = async (req, res) => {
  try {
    const supabaseUser = req.supabaseUser;

    const url = await spotifyService.buildOAuthUrl({
      flow: "link",
      userId: supabaseUser,
    });
    res.json({ url });
  } catch (error) {
    console.log("Error building url: " + error.message);
    return res.status(500).json({ message: "Failed to restore playlist!" });
  }
};

exports.restorePlaylist = async (req, res) => {
  try {
    const playlistId = req.params.id;
    const supabaseUser = req.supabaseUser;

    if (!supabaseUser || !playlistId) {
      console.log("Missing supababase user id or playlist id!");
      return res.status(400).json({ message: "Missing parameters!" });
    }

    const url = await spotifyService.buildOAuthUrl({
      flow: "restore",
      playlistId,
      userId: supabaseUser,
    });
    res.json({ url });
  } catch (error) {
    console.log("Error building url: " + error.message);
    return res.status(500).json({ message: "Failed to restore playlist!" });
  }
};

exports.fileRestore = async (req, res) => {
  try {
    const { playlistName, supabaseUser, trackIds } = req;

    if (!supabaseUser || !playlistName || !trackIds) {
      console.log("Error in backend: Missing authentication");
      return res
        .status(401)
        .json({ message: "Error: missing required parameters" });
    }

    const url = await spotifyService.buildOAuthUrl({
      flow: "fileRestore",
      playlistName: playlistName,
      trackIds: trackIds,
      userId: supabaseUser,
    });

    res.json({ url });
  } catch (error) {
    console.log("Error from controller: " + error);
    return res
      .status(500)
      .json({ message: "Error restoring file to playlist: " + error });
  }
};

exports.handleCallback = async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    throw new Error(
      "Missing authorization code or state from Spotify in callback"
    );
  }

  let parsedState;
  try {
    parsedState = JSON.parse(state);
  } catch (error) {
    return res.status(400).send("Invalid state");
  }

  try {
    const session = await spotifyService.handleOAuth(code, parsedState);

    if (parsedState.flow === "login") {
      spotifyService.setAuthCookies(res, session);
      return res.redirect(`${process.env.CLIENT_URL}/home`);
    }
    if (parsedState.flow === "link") {
      return res.redirect(
        `${process.env.CLIENT_URL}/home?firstTimeUser=${true}`
      );
    } else if (parsedState.flow === "restore") {
      return res.redirect(
        `${process.env.CLIENT_URL}/home?playlistRestored=${true}`
      );
    } else if (parsedState.flow === "fileRestore") {
      return res.redirect(
        `${process.env.CLIENT_URL}/home?fileRestored=${true}`
      );
    } else {
      return res.redirect(`${process.env.CLIENT_URL}/home`);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("Something went wrong!");
  }
};

exports.unlinkSpotify = async (req, res) => {
  const supabaseUser = req.supabaseUser;
  if (!supabaseUser) {
    return res.status(401).json({ message: "Unauthorized: Missing user ID" });
  }

  try {
    await spotifyService.unlinkSpotifyAccount(supabaseUser);
    return res.status(200).json({ message: "Account has been unlinked!" });
  } catch (error) {
    console.error("Error unlinking Spotify account", error);
    return res
      .status(500)
      .json({ message: "Failed to unlink Spotify account" });
  }
};

exports.getPlaylistTracks = async (req, res) => {
  const playlistId = req.params.playlistId;
  const accessToken = req.accessToken;
  try {
    const data = await spotifyService.getPlaylistTracks(
      playlistId,
      accessToken
    );
    res.json(data);
  } catch (error) {
    console.error("Error fetching playlist tracks", error.response.data);
    res.status(500).json({ error: "Failed to fetch playlist tracks" });
  }
};

exports.getPlaylists = async (req, res) => {
  const spotifyToken = req.spotifyAccessToken;
  const supabaseUser = req.supabaseUser;

  if (!spotifyToken || !supabaseUser) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const { offset = 0, limit = 50 } = req.query;

  try {
    const response = await spotifyService.getPlaylists(
      spotifyToken,
      parseInt(offset, 10),
      parseInt(limit, 10)
    );
    res.json(response);
  } catch (error) {
    console.error("Error fetching playlists", error);
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
};

exports.getProfile = async (req, res) => {
  const accessToken = req.spotifyAccessToken; //attached by spotify middleware
  if (!accessToken) {
    return res.status(401).json({ error: "Missing access token" });
  }

  try {
    const data = await spotifyService.getProfileInfo(accessToken);
    res.json(data);
  } catch (error) {
    console.error("Error fetching profile info", error.response.data);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};
