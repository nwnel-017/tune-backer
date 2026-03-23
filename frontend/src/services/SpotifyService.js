import csv from "../utils/csv";
import api from "../utils/axios/api";

export const getSpotifyProfile = async () => {
  try {
    const response = await api.get("/spotify/profile");
    console.log("Fetched Spotify profile:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error fetching Spotify profile:", error);
    throw error;
  }
};

export const startSpotifyAuth = async (mode = "link") => {
  console.log("starting auth with mode " + mode);

  if (!mode) {
    throw new Error("Error: startSpotifyAuth called incorrectly!");
  }

  let endpoint;
  if (mode === "link") {
    endpoint = `${process.env.REACT_APP_API_BASE_URL}/auth/linkAccount`;
  } else if (mode === "login") {
    // how do we tell backend which mode we are?
    endpoint = `${process.env.REACT_APP_API_BASE_URL}/auth/loginWithSpotify`;
  }
  try {
    const res = await api.get(endpoint);

    if (res.status !== 200) {
      throw new Error("backend returned: " + res.status);
    }
    const { url } = await res.data;
    window.location.href = url;
  } catch (error) {
    console.log("Error retrieving Spotify URL: " + error);
  }
};

export const unlinkSpotifyAccount = async () => {
  // To Do:
  // Call backend API to unlink Spotify account
  try {
    await api.post("/spotify/unlink");
    window.location.reload();
  } catch (error) {
    console.log("Error unlinking Spotify account: " + error);
    throw error;
  }
};

export const fetchUserPlaylists = async (offset = 0, limit = 50) => {
  const res = await api.get("/spotify/playlists", {
    params: { offset, limit },
  });
  return res.data;
};

export async function getMyBackups() {
  try {
    const res = await api.get("/backup/backups");

    return res.data;
  } catch (error) {
    console.log("Error retrieving backups from backend: " + error);
  }
}

export async function backupPlaylist(playlistId, playlistName) {
  if (!playlistId || !playlistName) {
    throw new Error("Playlist ID or name missing!");
  }
  console.log(
    "calling backend api route with: " +
      `${process.env.REACT_APP_API_BASE_URL}/backup/single/${playlistId}`,
  );
  try {
    const response = await api.post(
      `/backup/single/${playlistId}`,
      {},
      {
        responseType: "blob",
      },
    );
    const blob = response.data; // Access binary data from response.data
    const url = window.URL.createObjectURL(blob); // error here
    const link = document.createElement("a");
    const fileName = csv.getFileName(playlistName);
    link.href = url;
    link.download = `${fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error triggering backup:", error);
    throw error;
  }
}

export async function triggerWeeklyBackup(playlistId, playlistName) {
  console.log("calling weekly backup API"); // successfully reached
  try {
    await api.post("/backup/weekly", { playlistId, playlistName });
  } catch (error) {
    // throw {
    //   message: error.response?.data?.message || error.message,
    //   code: error.response?.data?.code || "UNKNOWN_ERROR",
    //   status: error.response?.status || 500,
    // };
    const err = new Error(error.response?.data?.message || error.message);

    err.code = error.response?.data?.code || "UNKNOWN_ERROR";
    err.status = error.response?.status || 500;

    throw err;
  }
}

export async function deleteBackup(playlistId) {
  console.log("hit deleteBackup() in service! deleting playlist " + playlistId);
  if (!playlistId) {
    throw new Error("No backup ID provided to deleteBackup");
  }
  console.log("Deleting backup with ID: " + playlistId);
  try {
    const res = await api.delete(`/backup/delete/${playlistId}`);
    return res.data;
  } catch (error) {
    console.log("Error deleting backup: " + error);
    throw error;
  }
}

export async function restorePlaylist(playlistId) {
  if (!playlistId) {
    throw new Error("No backup ID provided to restorePlaylist");
  }

  const res = await api.post(`/backup/restore/${playlistId}`, {});

  if (res.status !== 200) {
    throw new Error("backend returned: " + res.status);
  }
  const { url } = await res.data;
  window.location.href = url;
}

export async function uploadCSV(file, playlistName) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("playlistName", playlistName);
  try {
    const res = await api.post("/backup/upload", formData);
    const { url } = await res.data;
    window.location.href = url;
  } catch (error) {
    console.error("Error uploading CSV file:", error);
    throw new Error("Error uploading CSV file: " + error.message);
  }
  return;
}
