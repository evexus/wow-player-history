import { useState } from "react";

// Outline data specifically expect certain types for each field
type PlayerData = {
  name: string;
  race: string;
  class: string;
  active_spec_name: string;
  active_spec_role: string;
  gender: string;
  faction: string;
  achievement_points: number;
  region: string;
  realm: string;
  profile_url: string;
};

/*
* User enters character and name
* React stores those values with state
* User Clicks Get Player -> React sends GET request/Fetch to Espress
* Express has route to handle this and fetches from raider io 
* Sends this data that it got from Raider IO to the frontend
* React displays this data 
*/
function App() {

  // SearchName is what the user types into search
  // playerName is name returned into raider io
  const [searchName, setSearchName] = useState("");
  const [searchRealm, setSearchRealm] = useState("");
  const [error, setError] = useState(""); // Stores current error message 

  // Specify the outline of the object we are using for the data 
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);


  async function getPlayer() {
    setError("");

    // Fetch is the HTTP request to this url 
    // Back ticks instead of quotes to insert variable name in our search parameter 
    const response = await fetch(
      `http://localhost:3001/api/player/us/${searchRealm}/${searchName}`
    );

    const data = await response.json();

    // Successful HTTP is stored in the response - Boolean
    // Exit out and Set Data and Player Name to Cleared Values
    // Display this on your JSX 
    if (!response.ok) {
      setError(data.error || "Unable to find player");
      setPlayerData(null);
      return;
    }

    setPlayerData(data);
  }

  return (
    <div>
      <h1>WoW Player History</h1>

      <input
        type="text"
        value={searchName}
        onChange={(event) => {
          setSearchName(event.target.value);
        }}
        placeholder="Character Name"
      />

      <input
        type="text"
        value={searchRealm}
        onChange={(event) => {
          setSearchRealm(event.target.value);
        }}
        placeholder="Realm"
      />

      <button onClick={getPlayer}>
        Get Player
      </button>
      
      {/*Displays the error message if it does exist - Can still render empty paragraph even if error is NULL*/}
      {error && <p>{error}</p>}
      
      {/*Player data will be set to null if it doesnt exist - Not just dumped as JSON - frontend interpreting and processing it*/}
      {/* {playerData && (
        <div>
          <h2>{playerData.name}</h2>

          <p>Realm: {playerData.realm}</p>

          <p>Class: {playerData.class}</p>

          <p>Spec: {playerData.active_spec_name}</p>

          <p>Role: {playerData.active_spec_role}</p>

          <p>Faction: {playerData.faction}</p>

          <p>Achievement Points: {playerData.achievement_points}</p>
        </div>
      )} */}

      {playerData && (
        <pre>
          {JSON.stringify(playerData, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default App;