# Domain language

## Device data transfer

- **Device direct sync**: A user-initiated, one-shot transfer of the complete record set between two Android devices on the same local network. It is separate from continuous computer sync.
- **Discoverable**: A temporary state in which a device announces that it can receive connection requests from nearby devices while the app is in the foreground.
- **Active search**: A temporary state in which a device looks for discoverable peer devices on the current local network.
- **Peer device**: Another installation of 格记 identified by its stable device identity and current local-network endpoint.
- **Send records**: Offer this device's complete record set to a peer. The peer must approve before its records are replaced.
- **Receive records**: Request a peer's complete record set and replace this device's records after both devices approve.
- **Full replacement**: The validated incoming record set becomes the entire local business state. Missing records are intentionally removed rather than merged.
- **Recovery point**: An immutable local snapshot created immediately before full replacement so the user can restore the previous state.
- **Transfer approval**: A one-time decision on the device that is asked to disclose or replace records. Approval is required for every transfer, even for a previously used peer.

## Existing synchronization

- **Computer sync**: The existing continuous synchronization between an Android device and the Windows or Node companion server.
- **Computer backup**: A user-initiated snapshot copied from the Android device to the computer without changing the Android device's records.
