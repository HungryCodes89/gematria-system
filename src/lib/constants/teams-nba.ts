export interface TeamInfo {
  id: string
  league: 'NBA' | 'NHL' | 'MLB'
  fullName: string
  city: string
  teamName: string
  abbreviation: string
  venue: string
  venueCity: string
  areaCodes: number[]
  espnId?: string
  /** MLB Stats API team id (schedule endpoints) */
  mlbTeamId?: number
  conference: string
  division: string
  alternateNames?: string[]
  starPlayers?: string[]
  coach?: string
}

export const NBA_TEAMS: TeamInfo[] = [
  { id: 'atl', league: 'NBA', fullName: 'Atlanta Hawks', city: 'Atlanta', teamName: 'Hawks', abbreviation: 'ATL', venue: 'State Farm Arena', venueCity: 'Atlanta, GA', areaCodes: [404, 678, 770], espnId: '1', conference: 'Eastern', division: 'Southeast', starPlayers: ['Trae Young', 'Jalen Johnson', 'Onyeka Okongwu'], coach: 'Quin Snyder' },
  { id: 'bos', league: 'NBA', fullName: 'Boston Celtics', city: 'Boston', teamName: 'Celtics', abbreviation: 'BOS', venue: 'TD Garden', venueCity: 'Boston, MA', areaCodes: [617, 857], espnId: '2', conference: 'Eastern', division: 'Atlantic', starPlayers: ['Jayson Tatum', 'Jaylen Brown', 'Kristaps Porzingis'], coach: 'Joe Mazzulla' },
  { id: 'bkn', league: 'NBA', fullName: 'Brooklyn Nets', city: 'Brooklyn', teamName: 'Nets', abbreviation: 'BKN', venue: 'Barclays Center', venueCity: 'Brooklyn, NY', areaCodes: [718, 347], espnId: '17', conference: 'Eastern', division: 'Atlantic', starPlayers: ['Cam Thomas', 'Nic Claxton', 'Dennis Schroder'], coach: 'Jordi Fernandez' },
  { id: 'cha', league: 'NBA', fullName: 'Charlotte Hornets', city: 'Charlotte', teamName: 'Hornets', abbreviation: 'CHA', venue: 'Spectrum Center', venueCity: 'Charlotte, NC', areaCodes: [704, 980], espnId: '30', conference: 'Eastern', division: 'Southeast', starPlayers: ['LaMelo Ball', 'Brandon Miller', 'Miles Bridges'], coach: 'Charles Lee' },
  { id: 'chi', league: 'NBA', fullName: 'Chicago Bulls', city: 'Chicago', teamName: 'Bulls', abbreviation: 'CHI', venue: 'United Center', venueCity: 'Chicago, IL', areaCodes: [312, 773], espnId: '4', conference: 'Eastern', division: 'Central', starPlayers: ['Zach LaVine', 'Nikola Vucevic', 'Coby White'], coach: 'Billy Donovan' },
  { id: 'cle', league: 'NBA', fullName: 'Cleveland Cavaliers', city: 'Cleveland', teamName: 'Cavaliers', abbreviation: 'CLE', venue: 'Rocket Mortgage FieldHouse', venueCity: 'Cleveland, OH', areaCodes: [216], espnId: '5', conference: 'Eastern', division: 'Central', starPlayers: ['Donovan Mitchell', 'Darius Garland', 'Evan Mobley'], coach: 'Kenny Atkinson' },
  { id: 'dal', league: 'NBA', fullName: 'Dallas Mavericks', city: 'Dallas', teamName: 'Mavericks', abbreviation: 'DAL', venue: 'American Airlines Center', venueCity: 'Dallas, TX', areaCodes: [214, 469, 972], espnId: '6', conference: 'Western', division: 'Southwest', starPlayers: ['Kyrie Irving', 'Klay Thompson', 'PJ Washington'], coach: 'Jason Kidd' },
  { id: 'den', league: 'NBA', fullName: 'Denver Nuggets', city: 'Denver', teamName: 'Nuggets', abbreviation: 'DEN', venue: 'Ball Arena', venueCity: 'Denver, CO', areaCodes: [303, 720], espnId: '7', conference: 'Western', division: 'Northwest', starPlayers: ['Nikola Jokic', 'Jamal Murray', 'Michael Porter Jr'], coach: 'Michael Malone' },
  { id: 'det', league: 'NBA', fullName: 'Detroit Pistons', city: 'Detroit', teamName: 'Pistons', abbreviation: 'DET', venue: 'Little Caesars Arena', venueCity: 'Detroit, MI', areaCodes: [313], espnId: '8', conference: 'Eastern', division: 'Central', starPlayers: ['Cade Cunningham', 'Jalen Duren', 'Ausar Thompson'], coach: 'JB Bickerstaff' },
  { id: 'gsw', league: 'NBA', fullName: 'Golden State Warriors', city: 'Golden State', teamName: 'Warriors', abbreviation: 'GSW', venue: 'Chase Center', venueCity: 'San Francisco, CA', areaCodes: [415, 628], espnId: '9', conference: 'Western', division: 'Pacific', alternateNames: ['San Francisco', 'GS Warriors'], starPlayers: ['Stephen Curry', 'Draymond Green', 'Jonathan Kuminga'], coach: 'Steve Kerr' },
  { id: 'hou', league: 'NBA', fullName: 'Houston Rockets', city: 'Houston', teamName: 'Rockets', abbreviation: 'HOU', venue: 'Toyota Center', venueCity: 'Houston, TX', areaCodes: [713, 281, 832], espnId: '10', conference: 'Western', division: 'Southwest', starPlayers: ['Alperen Sengun', 'Jalen Green', 'Amen Thompson'], coach: 'Ime Udoka' },
  { id: 'ind', league: 'NBA', fullName: 'Indiana Pacers', city: 'Indiana', teamName: 'Pacers', abbreviation: 'IND', venue: 'Gainbridge Fieldhouse', venueCity: 'Indianapolis, IN', areaCodes: [317], espnId: '11', conference: 'Eastern', division: 'Central', alternateNames: ['Indianapolis'], starPlayers: ['Tyrese Haliburton', 'Pascal Siakam', 'Myles Turner'], coach: 'Rick Carlisle' },
  { id: 'lac', league: 'NBA', fullName: 'LA Clippers', city: 'Los Angeles', teamName: 'Clippers', abbreviation: 'LAC', venue: 'Intuit Dome', venueCity: 'Inglewood, CA', areaCodes: [213, 310, 323], espnId: '12', conference: 'Western', division: 'Pacific', alternateNames: ['LA', 'Los Angeles Clippers'], starPlayers: ['Kawhi Leonard', 'James Harden', 'Ivica Zubac'], coach: 'Tyronn Lue' },
  { id: 'lal', league: 'NBA', fullName: 'Los Angeles Lakers', city: 'Los Angeles', teamName: 'Lakers', abbreviation: 'LAL', venue: 'Crypto.com Arena', venueCity: 'Los Angeles, CA', areaCodes: [213, 310, 323], espnId: '13', conference: 'Western', division: 'Pacific', alternateNames: ['LA Lakers'], starPlayers: ['LeBron James', 'Anthony Davis', 'Luka Doncic'], coach: 'JJ Redick' },
  { id: 'mem', league: 'NBA', fullName: 'Memphis Grizzlies', city: 'Memphis', teamName: 'Grizzlies', abbreviation: 'MEM', venue: 'FedExForum', venueCity: 'Memphis, TN', areaCodes: [901], espnId: '29', conference: 'Western', division: 'Southwest', starPlayers: ['Ja Morant', 'Desmond Bane', 'Jaren Jackson Jr'], coach: 'Taylor Jenkins' },
  { id: 'mia', league: 'NBA', fullName: 'Miami Heat', city: 'Miami', teamName: 'Heat', abbreviation: 'MIA', venue: 'Kaseya Center', venueCity: 'Miami, FL', areaCodes: [305, 786], espnId: '14', conference: 'Eastern', division: 'Southeast', starPlayers: ['Bam Adebayo', 'Tyler Herro', 'Terry Rozier'], coach: 'Erik Spoelstra' },
  { id: 'mil', league: 'NBA', fullName: 'Milwaukee Bucks', city: 'Milwaukee', teamName: 'Bucks', abbreviation: 'MIL', venue: 'Fiserv Forum', venueCity: 'Milwaukee, WI', areaCodes: [414], espnId: '15', conference: 'Eastern', division: 'Central', starPlayers: ['Giannis Antetokounmpo', 'Damian Lillard', 'Khris Middleton'], coach: 'Doc Rivers' },
  { id: 'min', league: 'NBA', fullName: 'Minnesota Timberwolves', city: 'Minnesota', teamName: 'Timberwolves', abbreviation: 'MIN', venue: 'Target Center', venueCity: 'Minneapolis, MN', areaCodes: [612], espnId: '16', conference: 'Western', division: 'Northwest', alternateNames: ['Minneapolis'], starPlayers: ['Anthony Edwards', 'Rudy Gobert', 'Julius Randle'], coach: 'Chris Finch' },
  { id: 'nop', league: 'NBA', fullName: 'New Orleans Pelicans', city: 'New Orleans', teamName: 'Pelicans', abbreviation: 'NOP', venue: 'Smoothie King Center', venueCity: 'New Orleans, LA', areaCodes: [504], espnId: '3', conference: 'Western', division: 'Southwest', starPlayers: ['Zion Williamson', 'Brandon Ingram', 'CJ McCollum'], coach: 'Willie Green' },
  { id: 'nyk', league: 'NBA', fullName: 'New York Knicks', city: 'New York', teamName: 'Knicks', abbreviation: 'NYK', venue: 'Madison Square Garden', venueCity: 'New York, NY', areaCodes: [212, 917], espnId: '18', conference: 'Eastern', division: 'Atlantic', alternateNames: ['NY Knicks', 'NY'], starPlayers: ['Jalen Brunson', 'Karl-Anthony Towns', 'Mikal Bridges'], coach: 'Tom Thibodeau' },
  { id: 'okc', league: 'NBA', fullName: 'Oklahoma City Thunder', city: 'Oklahoma City', teamName: 'Thunder', abbreviation: 'OKC', venue: 'Paycom Center', venueCity: 'Oklahoma City, OK', areaCodes: [405], espnId: '25', conference: 'Western', division: 'Northwest', starPlayers: ['Shai Gilgeous-Alexander', 'Chet Holmgren', 'Jalen Williams'], coach: 'Mark Daigneault' },
  { id: 'orl', league: 'NBA', fullName: 'Orlando Magic', city: 'Orlando', teamName: 'Magic', abbreviation: 'ORL', venue: 'Kia Center', venueCity: 'Orlando, FL', areaCodes: [407, 321], espnId: '19', conference: 'Eastern', division: 'Southeast', starPlayers: ['Paolo Banchero', 'Franz Wagner', 'Jalen Suggs'], coach: 'Jamahl Mosley' },
  { id: 'phi', league: 'NBA', fullName: 'Philadelphia 76ers', city: 'Philadelphia', teamName: '76ers', abbreviation: 'PHI', venue: 'Wells Fargo Center', venueCity: 'Philadelphia, PA', areaCodes: [215, 267], espnId: '20', conference: 'Eastern', division: 'Atlantic', alternateNames: ['Philly', 'Sixers'], starPlayers: ['Joel Embiid', 'Tyrese Maxey', 'Paul George'], coach: 'Nick Nurse' },
  { id: 'phx', league: 'NBA', fullName: 'Phoenix Suns', city: 'Phoenix', teamName: 'Suns', abbreviation: 'PHX', venue: 'Footprint Center', venueCity: 'Phoenix, AZ', areaCodes: [602, 480], espnId: '21', conference: 'Western', division: 'Pacific', starPlayers: ['Devin Booker', 'Kevin Durant', 'Jusuf Nurkic'], coach: 'Mike Budenholzer' },
  { id: 'por', league: 'NBA', fullName: 'Portland Trail Blazers', city: 'Portland', teamName: 'Trail Blazers', abbreviation: 'POR', venue: 'Moda Center', venueCity: 'Portland, OR', areaCodes: [503, 971], espnId: '22', conference: 'Western', division: 'Northwest', alternateNames: ['Blazers'], starPlayers: ['Scoot Henderson', 'Anfernee Simons', 'Jerami Grant'], coach: 'Chauncey Billups' },
  { id: 'sac', league: 'NBA', fullName: 'Sacramento Kings', city: 'Sacramento', teamName: 'Kings', abbreviation: 'SAC', venue: 'Golden 1 Center', venueCity: 'Sacramento, CA', areaCodes: [916], espnId: '23', conference: 'Western', division: 'Pacific', starPlayers: ['Domantas Sabonis', 'De\'Aaron Fox', 'Malik Monk'], coach: 'Doug Christie' },
  { id: 'sas', league: 'NBA', fullName: 'San Antonio Spurs', city: 'San Antonio', teamName: 'Spurs', abbreviation: 'SAS', venue: 'Frost Bank Center', venueCity: 'San Antonio, TX', areaCodes: [210], espnId: '24', conference: 'Western', division: 'Southwest', starPlayers: ['Victor Wembanyama', 'Devin Vassell', 'Keldon Johnson'], coach: 'Mitch Johnson' },
  { id: 'tor', league: 'NBA', fullName: 'Toronto Raptors', city: 'Toronto', teamName: 'Raptors', abbreviation: 'TOR', venue: 'Scotiabank Arena', venueCity: 'Toronto, ON', areaCodes: [416, 647], espnId: '28', conference: 'Eastern', division: 'Atlantic', starPlayers: ['Scottie Barnes', 'Immanuel Quickley', 'Jakob Poeltl'], coach: 'Darko Rajakovic' },
  { id: 'uta', league: 'NBA', fullName: 'Utah Jazz', city: 'Utah', teamName: 'Jazz', abbreviation: 'UTA', venue: 'Delta Center', venueCity: 'Salt Lake City, UT', areaCodes: [801, 385], espnId: '26', conference: 'Western', division: 'Northwest', alternateNames: ['Salt Lake City'], starPlayers: ['Lauri Markkanen', 'Keyonte George', 'John Collins'], coach: 'Will Hardy' },
  { id: 'was', league: 'NBA', fullName: 'Washington Wizards', city: 'Washington', teamName: 'Wizards', abbreviation: 'WAS', venue: 'Capital One Arena', venueCity: 'Washington, DC', areaCodes: [202], espnId: '27', conference: 'Eastern', division: 'Southeast', alternateNames: ['DC'], starPlayers: ['Kyle Kuzma', 'Jordan Poole', 'Bilal Coulibaly'], coach: 'Brian Keefe' },
]

export function findNBATeam(query: string): TeamInfo | undefined {
  const q = String(query ?? '').toLowerCase().trim()
  return NBA_TEAMS.find(t =>
    t.fullName.toLowerCase() === q ||
    t.city.toLowerCase() === q ||
    t.teamName.toLowerCase() === q ||
    t.abbreviation.toLowerCase() === q ||
    t.alternateNames?.some(n => String(n ?? '').toLowerCase() === q)
  )
}
