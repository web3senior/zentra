// Chat room names, shared by the server and the browser: area:<id> per place, and dm:<a>:<b> for
// two people (their user ids sorted, so both sides name the same room)
export const areaRoom = (area) => `area:${area}`
export const dmRoom = (a, b) => `dm:${[a, b].sort().join(':')}`
export const dmOther = (room, me) => room.slice(3).split(':').find((id) => id !== me)
