const Discord = require('discord.js');
const client = new Discord.Client();
var CronJob = require('cron').CronJob;
const fs = require('fs')

const Stream = require("./modules/getStreams.js")
const Auth = require("./modules/auth.js")
const Channel = require("./modules/channelData.js")
const configLoc = './config/config.json'
const config = require(configLoc)
const http = require("http")
const host = '0.0.0.0' // Change to whatever you'd like
const port = 8080 // Change to whatever you'd like

//ready
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    //update the authorization key on startup
    UpdateAuthConfig()
});

//function that will run the checks
var Check = new CronJob(config.cronCheck,async function () {
    const tempData = JSON.parse(fs.readFileSync(configLoc))
    
    tempData.channels.map(async function (chan, i) {
        if (!chan.ChannelName) return;
        
        //get the assigned channel
        const sendChannel = client.guilds.cache.get(config.DiscordServerId).channels.cache.get(config.channelID)
        
        let StreamData = await Stream.getData(chan.ChannelName, tempData.twitch_clientID, tempData.authToken);

        if (StreamData.data.length == 0) {
            if (chan.discord_message_id) {
                sendChannel.messages.fetch(chan.discord_message_id).then(msg => {
                    //update the title, game, viewer_count and the thumbnail
                    msg.delete()
                    .then(msg => console.log(chan.ChannelName + " has gone offline, deleting discord message: " + chan.discord_message_id))
                    .catch(console.error);
                });
                tempData.channels[i].discord_message_id = ""
                fs.writeFileSync(configLoc, JSON.stringify(tempData, null, 4))
            }
            return;
        }
        
        StreamData = StreamData.data[0]

        //get the channel data for the thumbnail image
        const ChannelData = await Channel.getData(chan.ChannelName, tempData.twitch_clientID, tempData.authToken)
        
        if (!ChannelData)return
            
        if (StreamData.game_name === "" || StreamData.game_name == null){
            StreamData.game_name = "Music"
        }
        
        var titleString = ":red_circle: " + StreamData.user_name + " is now live";
        
        if (chan.go_live_message) {
            titleString = chan.go_live_message
        }

        //structure for the embed
        var SendEmbed = {
            "title": titleString,
            "description": StreamData.title,
            "url": `https://www.twitch.tv/${StreamData.user_login}`,
            "color": 6570404,
            "fields": [
                {
                    "name": "Playing:",
                    "value": StreamData.game_name,
                    "inline": true
                },
                {
                    "name": "Viewers:",
                    "value": StreamData.viewer_count,
                    "inline": true
                },
                {
                    "name": "Twitch:",
                    "value": `[Watch stream](https://www.twitch.tv/${StreamData.user_login})`
                },
                (chan.DiscordServer ? {
                    "name": "Discord Server:",
                    "value": `[Join here](${chan.DiscordServer})`
                } : {
                    "name": "** **",
                    "value": "** **"
                })
            ],
            "footer": {
                "text": StreamData.started_at
            },
            "image": {
                "url": `https://static-cdn.jtvnw.net/previews-ttv/live_user_${StreamData.user_login}-640x360.jpg?cacheBypass=${(Math.random()).toString()}`
            },
            "thumbnail": {
                "url": `${ChannelData.thumbnail_url}`
            }
        }

        if (chan.twitch_stream_id == StreamData.id || chan.discord_message_id) {
            sendChannel.messages.fetch(chan.discord_message_id).then(msg => {
                //update the title, game, viewer_count and the thumbnail
                msg.edit({ embed: SendEmbed })
            });
        } else {
            //this is the message when a streamer goes live. It will tag the assigned role
            await sendChannel.send({ embed: SendEmbed }).then(msg => {
                const channelObj = tempData.channels[i]
                
                channelObj.discord_message_id = msg.id
                channelObj.twitch_stream_id = StreamData.id
                
                if(config.roleID){
                    sendChannel.send(`<@&${config.roleID}>`)
                }
            })
        }
        //save config with new data
        fs.writeFileSync(configLoc, JSON.stringify(tempData, null, 4))
    })
});

//update the authorization key every hour
var updateAuth = new CronJob('0 * * * *', async function () {
    UpdateAuthConfig()
});

var statusCheck = new CronJob(config.cronStatus,async function () {
    const statusURL = config.statusPostURL;

    const postData = JSON.stringify({
        'content': config.botName, 'time' : Date.now()
    });

    const options ={
        hostname: statusURL,
        method: 'POST',
        headers: {
            'Content-Type' : 'application/text, application/json',
            'Content-Length': Buffer.byteLength(postData),
        },
    };

    if (statusURL) {
        const req = http.request(options, (res) => {
            console.log(`STATUS: $res.statusCode}`);
            console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                console.log(`BODY: ${chunk}`);
            });
            res.on('end', () => {
                console.log('No more data in response.');
            });
        });

        req.on('error', (e) => {
            console.error(`problem with request: ${e.message}`);
        });

        // Write data to request body
        req.write(postData);
        req.end();
    }
});

//get a new authorization key and update the config
async function UpdateAuthConfig(){
    let tempData = JSON.parse(fs.readFileSync(configLoc));

    //get the auth key
    const authKey = await Auth.getKey(tempData.twitch_clientID, tempData.twitch_secret);
    if (!authKey) return;

    //write the new auth key
    var tempConfig = JSON.parse(fs.readFileSync(configLoc));
    tempConfig.authToken = authKey;
    fs.writeFileSync(configLoc, JSON.stringify(tempConfig, null, 4));
}

//start the timers
updateAuth.start()
Check.start();
statusCheck.start();

//login
client.login(config.token);

// Define server response here
const requestListener = function(req, res) {
    res.writeHead(200);
    res.end("Hallo, de robot leeft.");
}

// start the http server

const server = http.createServer(requestListener);
server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});

