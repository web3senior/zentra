import { registries } from './chains'
// Area chat rooms (docs/plans/people-presence-chat.md): one per place in the colony. ids name the
// room (area:<id>); chain districts use their registry id.
export const chatAreas = ['hub', 'jobs', ...registries.map((registry) => registry.id)]
export const chatRules = {
  bodyMax: 1000, pageSize: 40, areaRetention: 1000,
  // Per person: messages a minute, new 1:1 conversations an hour, position updates a second
  messagesPerMinute: 20, newConversationsPerHour: 10, movesPerSecond: 15,
  reactions: ['👍', '❤️', '😂', '🔥', '😮', '😢', '🙏', '👀'],
  muteHours: 24,
}
