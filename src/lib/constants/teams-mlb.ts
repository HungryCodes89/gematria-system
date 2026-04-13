import type { TeamInfo } from './teams-nba'

/** Names match MLB Stats API `team.name` on schedule responses (critical for DB upserts). */
export const MLB_TEAMS: TeamInfo[] = [
  { id: 'ath', league: 'MLB', fullName: 'Athletics', city: 'Sacramento', teamName: 'Athletics', abbreviation: 'ATH', venue: 'Sutter Health Park', venueCity: 'Sacramento, CA', areaCodes: [916], espnId: '11', mlbTeamId: 133, conference: 'AL', division: 'West', alternateNames: ['Oakland', 'Oakland Athletics', 'A\'s'] },
  { id: 'pit', league: 'MLB', fullName: 'Pittsburgh Pirates', city: 'Pittsburgh', teamName: 'Pirates', abbreviation: 'PIT', venue: 'PNC Park', venueCity: 'Pittsburgh, PA', areaCodes: [412], espnId: '23', mlbTeamId: 134, conference: 'NL', division: 'Central' },
  { id: 'sd', league: 'MLB', fullName: 'San Diego Padres', city: 'San Diego', teamName: 'Padres', abbreviation: 'SD', venue: 'Petco Park', venueCity: 'San Diego, CA', areaCodes: [619], espnId: '25', mlbTeamId: 135, conference: 'NL', division: 'West' },
  { id: 'sea', league: 'MLB', fullName: 'Seattle Mariners', city: 'Seattle', teamName: 'Mariners', abbreviation: 'SEA', venue: 'T-Mobile Park', venueCity: 'Seattle, WA', areaCodes: [206], espnId: '12', mlbTeamId: 136, conference: 'AL', division: 'West' },
  { id: 'sf', league: 'MLB', fullName: 'San Francisco Giants', city: 'San Francisco', teamName: 'Giants', abbreviation: 'SF', venue: 'Oracle Park', venueCity: 'San Francisco, CA', areaCodes: [415], espnId: '26', mlbTeamId: 137, conference: 'NL', division: 'West' },
  { id: 'stl', league: 'MLB', fullName: 'St. Louis Cardinals', city: 'St. Louis', teamName: 'Cardinals', abbreviation: 'STL', venue: 'Busch Stadium', venueCity: 'St. Louis, MO', areaCodes: [314], espnId: '24', mlbTeamId: 138, conference: 'NL', division: 'Central' },
  { id: 'tb', league: 'MLB', fullName: 'Tampa Bay Rays', city: 'Tampa Bay', teamName: 'Rays', abbreviation: 'TB', venue: 'George M. Steinbrenner Field', venueCity: 'Tampa, FL', areaCodes: [813], espnId: '30', mlbTeamId: 139, conference: 'AL', division: 'East', alternateNames: ['Tampa', 'Rays'] },
  { id: 'tex', league: 'MLB', fullName: 'Texas Rangers', city: 'Texas', teamName: 'Rangers', abbreviation: 'TEX', venue: 'Globe Life Field', venueCity: 'Arlington, TX', areaCodes: [817], espnId: '13', mlbTeamId: 140, conference: 'AL', division: 'West', alternateNames: ['Arlington'] },
  { id: 'tor', league: 'MLB', fullName: 'Toronto Blue Jays', city: 'Toronto', teamName: 'Blue Jays', abbreviation: 'TOR', venue: 'Rogers Centre', venueCity: 'Toronto, ON', areaCodes: [416], espnId: '14', mlbTeamId: 141, conference: 'AL', division: 'East', alternateNames: ['Blue Jays'] },
  { id: 'min', league: 'MLB', fullName: 'Minnesota Twins', city: 'Minnesota', teamName: 'Twins', abbreviation: 'MIN', venue: 'Target Field', venueCity: 'Minneapolis, MN', areaCodes: [612], espnId: '9', mlbTeamId: 142, conference: 'AL', division: 'Central', alternateNames: ['Minneapolis'] },
  { id: 'phi', league: 'MLB', fullName: 'Philadelphia Phillies', city: 'Philadelphia', teamName: 'Phillies', abbreviation: 'PHI', venue: 'Citizens Bank Park', venueCity: 'Philadelphia, PA', areaCodes: [215], espnId: '22', mlbTeamId: 143, conference: 'NL', division: 'East', alternateNames: ['Philly'] },
  { id: 'atl', league: 'MLB', fullName: 'Atlanta Braves', city: 'Atlanta', teamName: 'Braves', abbreviation: 'ATL', venue: 'Truist Park', venueCity: 'Atlanta, GA', areaCodes: [404], espnId: '15', mlbTeamId: 144, conference: 'NL', division: 'East' },
  { id: 'cws', league: 'MLB', fullName: 'Chicago White Sox', city: 'Chicago', teamName: 'White Sox', abbreviation: 'CWS', venue: 'Rate Field', venueCity: 'Chicago, IL', areaCodes: [312], espnId: '4', mlbTeamId: 145, conference: 'AL', division: 'Central', alternateNames: ['Chi Sox', 'White Sox'] },
  { id: 'mia', league: 'MLB', fullName: 'Miami Marlins', city: 'Miami', teamName: 'Marlins', abbreviation: 'MIA', venue: 'loanDepot park', venueCity: 'Miami, FL', areaCodes: [305], espnId: '28', mlbTeamId: 146, conference: 'NL', division: 'East' },
  { id: 'nyy', league: 'MLB', fullName: 'New York Yankees', city: 'New York', teamName: 'Yankees', abbreviation: 'NYY', venue: 'Yankee Stadium', venueCity: 'Bronx, NY', areaCodes: [718], espnId: '10', mlbTeamId: 147, conference: 'AL', division: 'East', alternateNames: ['Yankees', 'NY Yankees'] },
  { id: 'mil', league: 'MLB', fullName: 'Milwaukee Brewers', city: 'Milwaukee', teamName: 'Brewers', abbreviation: 'MIL', venue: 'American Family Field', venueCity: 'Milwaukee, WI', areaCodes: [414], espnId: '8', mlbTeamId: 158, conference: 'NL', division: 'Central' },
  { id: 'laa', league: 'MLB', fullName: 'Los Angeles Angels', city: 'Los Angeles', teamName: 'Angels', abbreviation: 'LAA', venue: 'Angel Stadium', venueCity: 'Anaheim, CA', areaCodes: [714], espnId: '3', mlbTeamId: 108, conference: 'AL', division: 'West', alternateNames: ['Anaheim', 'LA Angels'] },
  { id: 'az', league: 'MLB', fullName: 'Arizona Diamondbacks', city: 'Arizona', teamName: 'Diamondbacks', abbreviation: 'AZ', venue: 'Chase Field', venueCity: 'Phoenix, AZ', areaCodes: [602], espnId: '29', mlbTeamId: 109, conference: 'NL', division: 'West', alternateNames: ['D-backs', 'Phoenix'] },
  { id: 'bal', league: 'MLB', fullName: 'Baltimore Orioles', city: 'Baltimore', teamName: 'Orioles', abbreviation: 'BAL', venue: 'Oriole Park', venueCity: 'Baltimore, MD', areaCodes: [410], espnId: '1', mlbTeamId: 110, conference: 'AL', division: 'East' },
  { id: 'bos', league: 'MLB', fullName: 'Boston Red Sox', city: 'Boston', teamName: 'Red Sox', abbreviation: 'BOS', venue: 'Fenway Park', venueCity: 'Boston, MA', areaCodes: [617], espnId: '2', mlbTeamId: 111, conference: 'AL', division: 'East' },
  { id: 'chc', league: 'MLB', fullName: 'Chicago Cubs', city: 'Chicago', teamName: 'Cubs', abbreviation: 'CHC', venue: 'Wrigley Field', venueCity: 'Chicago, IL', areaCodes: [773], espnId: '16', mlbTeamId: 112, conference: 'NL', division: 'Central' },
  { id: 'cin', league: 'MLB', fullName: 'Cincinnati Reds', city: 'Cincinnati', teamName: 'Reds', abbreviation: 'CIN', venue: 'Great American Ball Park', venueCity: 'Cincinnati, OH', areaCodes: [513], espnId: '17', mlbTeamId: 113, conference: 'NL', division: 'Central' },
  { id: 'cle', league: 'MLB', fullName: 'Cleveland Guardians', city: 'Cleveland', teamName: 'Guardians', abbreviation: 'CLE', venue: 'Progressive Field', venueCity: 'Cleveland, OH', areaCodes: [216], espnId: '5', mlbTeamId: 114, conference: 'AL', division: 'Central', alternateNames: ['Cleveland'] },
  { id: 'col', league: 'MLB', fullName: 'Colorado Rockies', city: 'Colorado', teamName: 'Rockies', abbreviation: 'COL', venue: 'Coors Field', venueCity: 'Denver, CO', areaCodes: [303], espnId: '27', mlbTeamId: 115, conference: 'NL', division: 'West', alternateNames: ['Denver'] },
  { id: 'det', league: 'MLB', fullName: 'Detroit Tigers', city: 'Detroit', teamName: 'Tigers', abbreviation: 'DET', venue: 'Comerica Park', venueCity: 'Detroit, MI', areaCodes: [313], espnId: '6', mlbTeamId: 116, conference: 'AL', division: 'Central' },
  { id: 'hou', league: 'MLB', fullName: 'Houston Astros', city: 'Houston', teamName: 'Astros', abbreviation: 'HOU', venue: 'Daikin Park', venueCity: 'Houston, TX', areaCodes: [713], espnId: '18', mlbTeamId: 117, conference: 'AL', division: 'West' },
  { id: 'kc', league: 'MLB', fullName: 'Kansas City Royals', city: 'Kansas City', teamName: 'Royals', abbreviation: 'KC', venue: 'Kauffman Stadium', venueCity: 'Kansas City, MO', areaCodes: [816], espnId: '7', mlbTeamId: 118, conference: 'AL', division: 'Central' },
  { id: 'lad', league: 'MLB', fullName: 'Los Angeles Dodgers', city: 'Los Angeles', teamName: 'Dodgers', abbreviation: 'LAD', venue: 'Dodger Stadium', venueCity: 'Los Angeles, CA', areaCodes: [323], espnId: '19', mlbTeamId: 119, conference: 'NL', division: 'West', alternateNames: ['LA Dodgers'] },
  { id: 'wsh', league: 'MLB', fullName: 'Washington Nationals', city: 'Washington', teamName: 'Nationals', abbreviation: 'WSH', venue: 'Nationals Park', venueCity: 'Washington, DC', areaCodes: [202], espnId: '20', mlbTeamId: 120, conference: 'NL', division: 'East', alternateNames: ['DC', 'Nats'] },
  { id: 'nym', league: 'MLB', fullName: 'New York Mets', city: 'New York', teamName: 'Mets', abbreviation: 'NYM', venue: 'Citi Field', venueCity: 'Queens, NY', areaCodes: [718], espnId: '21', mlbTeamId: 121, conference: 'NL', division: 'East', alternateNames: ['NY Mets', 'Mets'] },
]

export function findMLBTeam(query: string): TeamInfo | undefined {
  const q = String(query ?? '').toLowerCase().trim()
  return MLB_TEAMS.find(
    t =>
      t.fullName.toLowerCase() === q ||
      t.city.toLowerCase() === q ||
      t.teamName.toLowerCase() === q ||
      t.abbreviation.toLowerCase() === q ||
      `${t.city} ${t.teamName}`.toLowerCase() === q ||
      t.alternateNames?.some(n => String(n ?? '').toLowerCase() === q),
  )
}
