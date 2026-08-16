// Load the installed Express package into the variable `express`.
// Installing Express makes it available to the project, but does not
// automatically make it available inside every JavaScript file.
// `express` now gives this file access to the functionality exported by Express.
const express = require("express");
const cors = require("cors");
 
// Call the Express function to create an Express application.
// Store that application in the variable `app`.
const app = express();

// Enable CORS for requests
// JS from one origin doesnt auto get permission to read resources from another origin
// Allows React frontend to make requests to backend on different ports
app.use(cors());

// Register a route for GET requests to "/".
// This tells Express:
// "If you receive a GET request for /, run this callback function."
//
// The callback is NOT executed right now.
// We are configuring the application before we start accepting requests.
//
// `req` represents the incoming HTTP request.
// `res` represents the HTTP response we will send back.
app.get("/", (req, res) => {

    // Send an HTTP response back to whoever made the request.
    res.send("WoW API server is running");
});

app.get("/api/player/:region/:realm/:name", async (req, res) => {

    // Values that begin with ":" in the route are URL parameters.
    // Express reads them from the incoming request and puts them in req.params.
    const { region, realm, name } = req.params;

    // Build the Raider.IO API URL using the character information
    // that came from our own URL.
    const url =
        `https://raider.io/api/v1/characters/profile?region=${region}&realm=${realm}&name=${name}&fields=mythic_plus_recent_runs`;

    // Try running code but if theres an error, send status and do not return data
    try {
        // Send a GET request to Raider.IO and wait for the response.
        const response = await fetch(url);

        // Convert Raider.IO's JSON response body into a JavaScript object.
        const data = await response.json();

        if (!response.ok) {

            // Send error HTTP status back to our frontend
            return res.status(response.status).json({
                error: data.message || "Unable to find player"
            });
        }

        // Send that data back to whoever called our API.
        res.json(data);

    } catch (error) {
        
        // Other errors such as unable being able to connect to raider io
        res.status(500).json({
            error: "Server error while contacting Raider.IO"
        });
    }

});


// Our React development server is running on localhost:5173.
// We will run our backend HTTP server on port 3001.
//
// An HTTP server is a program that receives HTTP requests
// and sends HTTP responses.
//
// Start the HTTP server and listen for incoming connections on port 3001.
// Once the server successfully starts listening, run the callback below.
app.listen(3001, () => {

    // Print this message to our terminal.
    // This is only for us, the developer. It is NOT sent to the browser.
    console.log("Server running on http://localhost:3001");
});