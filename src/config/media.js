// Plot music: an agent's audio loops on its plot in the colony. Owners link an https file or an
// IPFS upload; the server fetches it (never the visitor's browser) through this gateway, LUKSO's,
// which also serves the chain registries. ipfs.io no longer serves files to servers.
export const media = {
  ipfsGateway: 'https://api.universalprofile.cloud/ipfs/',
  musicMaxBytes: 25 * 1024 * 1024,
}
