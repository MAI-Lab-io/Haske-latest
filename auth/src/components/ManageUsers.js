
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { FaTrash, FaLock, FaUnlock } from "react-icons/fa";
import { auth } from "../firebaseConfig";
import "./ManageUsers.css";

const API_BASE = "https://api.haske.online";

// All protected API requests use Firebase authentication.
async function authenticatedRequest(path, options = {}) {
  await auth.authStateReady();

  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("Your session is unavailable. Please sign in again.");
  }

  const token = await currentUser.getIdToken();

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new Error(
      "Authentication failed. Please sign out and sign in again."
    );
  }

  if (response.status === 403) {
    throw new Error(
      "Your account does not have permission to perform this action."
    );
  }

  let data = null;

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `Request failed with HTTP ${response.status}`
    );
  }

  return data;
}

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [notification, setNotification] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [loadError, setLoadError] = useState("");

  // Retrieve and validate users before sorting.
  const fetchUsers = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);

      const data = await authenticatedRequest(
        "/api/verification/get-users"
      );

      if (!Array.isArray(data)) {
        throw new Error(
          "Invalid response: the server did not return a user list."
        );
      }

      const sortedUsers = [...data].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime() || 0;
        const dateB = new Date(b.created_at || 0).getTime() || 0;
        return dateB - dateA;
      });

      setUsers(sortedUsers);
      setLoadError("");
    } catch (error) {
      console.error("Error fetching users:", error.message);
      setLoadError(error.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // Initial load and automatic refresh every 30 seconds.
  useEffect(() => {
    fetchUsers(true);

    const interval = setInterval(() => {
      fetchUsers(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchUsers]);

  // Preserve selected filter whenever users refresh.
  const filteredUsers = useMemo(() => {
    switch (filter) {
      case "verified":
        return users.filter(
          (user) => user.approved && !user.deactivated
        );

      case "unverified":
        return users.filter((user) => !user.approved);

      case "deactivated":
        return users.filter((user) => user.deactivated);

      default:
        return users;
    }
  }, [users, filter]);

  const isProtectedUser = (user) => {
    const currentUser = auth.currentUser;

    return (
      user.role === "super_admin" ||
      (
        currentUser?.email &&
        user.email?.toLowerCase() ===
          currentUser.email.toLowerCase()
      )
    );
  };

  // Log a successful administrative action.
  const logUserAction = async (userId, action) => {
    try {
      await authenticatedRequest(
        "/api/verification/log-action",
        {
          method: "POST",
          body: JSON.stringify({
            email: auth.currentUser?.email,
            action: `User ${action} with ID ${userId}`,
          }),
        }
      );
    } catch (error) {
      console.error("Failed to log action:", error.message);
    }
  };

  // Generic handler for protected user-management actions.
  const performAction = async ({
    userId,
    path,
    method = "POST",
    body,
    successMessage,
    actionName,
  }) => {
    if (processingId !== null) return;

    try {
      setProcessingId(userId);
      setNotification("");

      await authenticatedRequest(path, {
        method,
        ...(body !== undefined
          ? { body: JSON.stringify(body) }
          : {}),
      });

      setNotification(successMessage);

      // Record the successful action.
      if (actionName) {
        await logUserAction(userId, actionName);
      }

      // Refresh only after success.
      await fetchUsers();
    } catch (error) {
      console.error("User management error:", error.message);
      setNotification(error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprove = async (user, approved) => {
    if (isProtectedUser(user)) {
      setNotification("This account cannot be modified here.");
      return;
    }

    await performAction({
      userId: user.id,
      path:
        `/api/verification/approve-user/` +
        encodeURIComponent(user.id),
      method: "POST",
      body: { approved },
      successMessage: approved
        ? "User approved successfully!"
        : "User approval updated successfully!",
      actionName: approved ? "approved" : "approval updated",
    });
  };

  const handleDeactivate = async (user, deactivated) => {
    if (isProtectedUser(user)) {
      setNotification("This account cannot be modified here.");
      return;
    }

    const confirmed = window.confirm(
      deactivated
        ? `Deactivate ${user.email}?`
        : `Reactivate ${user.email}?`
    );

    if (!confirmed) return;

    await performAction({
      userId: user.id,
      path:
        `/api/verification/deactivate-user/` +
        encodeURIComponent(user.id),
      method: "POST",
      body: { deactivated },
      successMessage: deactivated
        ? "User deactivated successfully!"
        : "User activated successfully!",
      actionName: deactivated ? "deactivated" : "activated",
    });
  };

  const handleMakeAdmin = async (user) => {
    if (isProtectedUser(user)) {
      setNotification("This account cannot be modified here.");
      return;
    }

    if (user.role !== "user") return;

    const confirmed = window.confirm(
      `Are you sure you want to promote ${user.email} to Admin?`
    );

    if (!confirmed) return;

    // The backend independently verifies super-admin authority.
    await performAction({
      userId: user.id,
      path:
        `/api/verification/update-role/` +
        encodeURIComponent(user.id),
      method: "POST",
      body: { role: "admin" },
      successMessage: "User promoted to Admin successfully!",
      actionName: "promoted to admin",
    });
  };

  const handleDelete = async (user) => {
    if (isProtectedUser(user)) {
      setNotification("This account cannot be deleted here.");
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete ${user.email}? This action cannot be undone.`
    );

    if (!confirmed) return;

    await performAction({
      userId: user.id,
      path:
        `/api/verification/delete-user/` +
        encodeURIComponent(user.id),
      method: "DELETE",
      successMessage: "User deleted successfully!",
      actionName: "deleted",
    });
  };

  return (
    <div className="manage-users-container">
      <h1>User Management</h1>

      {notification && (
        <div className="notification" role="status">
          {notification}
        </div>
      )}

      {loadError && (
        <div className="notification" role="alert">
          {loadError}
        </div>
      )}

      <div className="filter-section">
        <label htmlFor="filter">Filter Users:</label>

        <select
          id="filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Users</option>
          <option value="verified">Verified</option>
          <option value="unverified">Unverified</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      {loading ? (
        <p>Loading users...</p>
      ) : loadError && users.length === 0 ? (
        <p>Unable to load users.</p>
      ) : filteredUsers.length === 0 ? (
        <p>No users to display.</p>
      ) : (
        <table className="user-table">
          <thead>
            <tr>
              <th>Last Name</th>
              <th>First Name</th>
              <th>Institution</th>
              <th>Role</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Actions</th>
              <th>Approval</th>
              <th>Admin</th>
            </tr>
          </thead>

          <tbody>
            {filteredUsers.map((user) => {
              const protectedAccount = isProtectedUser(user);
              const busy = processingId !== null;

              return (
                <tr
                  key={user.id}
                  className={
                    user.deactivated
                      ? "deactivated-row"
                      : user.approved
                      ? "verified-row"
                      : "unverified-row"
                  }
                >
                  <td>{user.last_name}</td>
                  <td>{user.first_name}</td>
                  <td>{user.institution_name}</td>
                  <td>{user.role}</td>
                  <td>{user.email}</td>
                  <td>{user.phone_number}</td>

                  <td>
                    {user.deactivated
                      ? "Deactivated"
                      : user.approved
                      ? "Verified"
                      : "Unverified"}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="delete-icon"
                      title="Delete User"
                      aria-label={`Delete ${user.email}`}
                      disabled={busy || protectedAccount}
                      onClick={() => handleDelete(user)}
                    >
                      <FaTrash />
                    </button>

                    <button
                      type="button"
                      title={
                        user.deactivated
                          ? "Activate User"
                          : "Deactivate User"
                      }
                      aria-label={
                        user.deactivated
                          ? `Activate ${user.email}`
                          : `Deactivate ${user.email}`
                      }
                      disabled={busy || protectedAccount}
                      onClick={() =>
                        handleDeactivate(user, !user.deactivated)
                      }
                    >
                      {user.deactivated ? (
                        <FaUnlock />
                      ) : (
                        <FaLock />
                      )}
                    </button>
                  </td>

                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(user.approved)}
                      disabled={
                        busy ||
                        user.deactivated ||
                        protectedAccount
                      }
                      onChange={() =>
                        handleApprove(user, !user.approved)
                      }
                    />
                  </td>

                  <td>
                    {user.role === "super_admin" ? (
                      <span>Protected</span>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          busy ||
                          protectedAccount ||
                          user.role !== "user"
                        }
                        onClick={() => handleMakeAdmin(user)}
                      >
                        {user.role === "admin"
                          ? "Admin"
                          : "Make Admin"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ManageUsers;
