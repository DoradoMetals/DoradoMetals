// A RE-EXPORT AND NOTHING ELSE. Every spot hook lives in @dorado/client
// (ruling 62); this file is kept only because surfaces other lanes own import
// the name from here, and rewriting somebody else's file is how two lanes
// collide. It calls no API.
export { useSpotPrices } from '@dorado/client'
