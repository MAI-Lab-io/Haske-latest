
import React, { useEffect, useState } from "react";
import {
  Paper,
  Typography,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Alert,
  CircularProgress,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { toast } from "react-toastify";
import { auth } from "../firebaseConfig";

const API_BASE = "https://api.haske.online";

async function adminRequest(path, options = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in again.");
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (response.status === 403) {
    throw new Error("You do not have permission to perform this action.");
  }

  if (!response.ok) {
    let message = `Request failed (HTTP ${response.status})`;

    try {
      const data = await response.json();
      message = data.message || data.error || message;
    } catch {
      // Preserve the HTTP error message.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

const Settings = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      try {
        setLoading(true);
        setError("");

        // Wait for Firebase to restore the login session.
        await auth.authStateReady();

        const data = await adminRequest(
          "/api/verification/get-users"
        );

        if (!cancelled) {
          if (!Array.isArray(data)) {
            throw new Error("Invalid user list returned by server.");
          }
          setUsers(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          toast.error(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  const changeRole = async () => {
    if (!pendingChange || savingId !== null) return;

    const { userId, newRole } = pendingChange;

    try {
      setSavingId(userId);

      await adminRequest(
        `/api/verification/update-role/${encodeURIComponent(userId)}`,
        {
          method: "POST",
          body: JSON.stringify({ role: newRole }),
        }
      );

      setUsers((current) =>
        current.map((user) =>
          user.id === userId
            ? { ...user, role: newRole }
            : user
        )
      );

      toast.success(
        newRole === "admin"
          ? "User promoted to admin successfully."
          : "User demoted successfully."
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingId(null);
      setPendingChange(null);
    }
  };

  return (
    <Paper
      sx={{
        p: 3,
        backgroundColor: "#E5E7EB",
        color: "#0F172A",
      }}
    >
      <Typography variant="h5" sx={{ color: "#0F172A" }}>
        Admin Settings
      </Typography>

      <Typography variant="h6" sx={{ mt: 3, color: "#dd841a" }}>
        Manage User Roles
      </Typography>

      {error && (
        <Alert severity="error" sx={{ my: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Table sx={{ backgroundColor: "#333" }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: "#dd841a" }}>
                Email
              </TableCell>
              <TableCell sx={{ color: "#dd841a" }}>
                Role
              </TableCell>
              <TableCell sx={{ color: "#dd841a" }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell sx={{ color: "#E5E7EB" }}>
                  {user.email}
                </TableCell>

                <TableCell sx={{ color: "#E5E7EB" }}>
                  {user.role}
                </TableCell>

                <TableCell>
                  {user.role === "super_admin" ? (
                    <Typography sx={{ color: "#E5E7EB" }}>
                      Protected
                    </Typography>
                  ) : user.role === "user" ? (
                    <Button
                      variant="contained"
                      disabled={savingId !== null}
                      sx={{
                        backgroundColor: "#dd841a",
                        color: "#0F172A",
                      }}
                      onClick={() =>
                        setPendingChange({
                          userId: user.id,
                          email: user.email,
                          newRole: "admin",
                        })
                      }
                    >
                      Promote to Admin
                    </Button>
                  ) : user.role === "admin" ? (
                    <Button
                      variant="outlined"
                      disabled={savingId !== null}
                      sx={{
                        borderColor: "#dd841a",
                        color: "#dd841a",
                      }}
                      onClick={() =>
                        setPendingChange({
                          userId: user.id,
                          email: user.email,
                          newRole: "user",
                        })
                      }
                    >
                      Demote to User
                    </Button>
                  ) : (
                    <Typography sx={{ color: "#E5E7EB" }}>
                      No role action
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={Boolean(pendingChange)}
        onClose={() => {
          if (savingId === null) setPendingChange(null);
        }}
      >
        <DialogTitle>Confirm Role Change</DialogTitle>

        <DialogContent>
          {pendingChange &&
            `Change ${pendingChange.email} to ${pendingChange.newRole}?`}
        </DialogContent>

        <DialogActions>
          <Button
            disabled={savingId !== null}
            onClick={() => setPendingChange(null)}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={savingId !== null}
            onClick={changeRole}
          >
            {savingId !== null ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default Settings;
