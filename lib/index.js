'use strict';





/*=============================================
=                     Setup                   =
=============================================*/

const fs      = require('fs');
const cfg     = require('../config.js');
const Discord = require('discord.js');
const bot     = new Discord.Client();

const path = require('path');
const jsonfile = require('jsonfile');
const dataPath = path.join(__dirname, '../data');
const tokenDataPath = dataPath + "/tokenDataFiles";
const stocksPath = dataPath + "/stocks.json";

var server;
var channels = {};
var roles = {};

const admins = [
    126134237270114304,
    98964911178133504,
    70327824535261184
];


bot.login(cfg.token).then(() => {
    console.log('Running!');
});

bot.on("ready", () => {
    console.log(`Serving for a total of ${bot.users.size} users!`);
    server = bot.guilds.find('name', 'National Championship Series');
    channels.rivalstokens = server.channels.find('name', 'rivals-tokens');
    channels.mordor = server.channels.find('name', 'mordor');
    channels.tournamentLinks = server.channels.find('name', 'tournament-links');
    channels.botTesting = server.channels.find('name', 'bot-testing-in-progress-dnd');
});





/*=============================================
=               Message Parsing               =
=============================================*/

bot.on("message", msg => {
    if (msg.channel.equals(channels.mordor) || msg.channel.equals(channels.rivalstokens) || msg.channel.equals(channels.botTesting)) {

            var messageContents = "";




            if (msg.content.toLowerCase().startsWith("!token")) {
                var userTokenData = loadUserTokenData(msg.member.user);
                messageContents = msg.member + " You currently have " + userTokenData.tokens + " Rivals Tokens.";
                msg.channel.sendMessage(messageContents).catch(console.error);
            }




            if ((msg.content.toLowerCase().startsWith("!stock")) || (msg.content.toLowerCase().startsWith("!market"))){
                var stockData = jsonfile.readFileSync(stocksPath);
                messageContents = 
                "**Fire** is valued at **" + stockData["fire"]["value"] + "** with a total of **" + stockData["fire"]["shares"] + "** outstanding shares.\n**Water** is valued at **" + stockData["water"]["value"] + "** with a total of **" + stockData["water"]["shares"] + "** outstanding shares.\n**Earth** is valued at **" + stockData["earth"]["value"] + "** with a total of **" + stockData["earth"]["shares"] + "** outstanding shares.\n**Air** is valued at **" + stockData["air"]["value"] + "** with a total of **" + stockData["air"]["shares"] + "** outstanding shares.\n\n**Overall**, there is currently a total of **" + (stockData["fire"]["shares"] + stockData["water"]["shares"] + stockData["air"]["shares"] + stockData["earth"]["shares"]) + "** outstanding shares."
                msg.channel.sendMessage(messageContents).catch(console.error);
            }




            if (msg.content.toLowerCase().startsWith("!share")) {
                var userTokenData = loadUserTokenData(msg.member.user);
                var stockData = jsonfile.readFileSync(stocksPath);
                messageContents = msg.member + "\n**Fire:** " + userTokenData.shares["fire"] + " shares. Total value of " + (userTokenData.shares["fire"] * stockData["fire"]["value"]) + ".\n**Water:** " + userTokenData.shares["water"] + " shares. Total value of " + (userTokenData.shares["water"] * stockData["water"]["value"]) + ".\n**Earth:** " + userTokenData.shares["earth"] + " shares. Total value of " + (userTokenData.shares["earth"] * stockData["earth"]["value"]) + ".\n**Air:** " + userTokenData.shares["air"] + " shares. Total value of " + (userTokenData.shares["air"] * stockData["air"]["value"]) + ".";
                msg.channel.sendMessage(messageContents).catch(console.error);
            }




            if (msg.content.toLowerCase().startsWith("!purchase") || msg.content.toLowerCase().startsWith("!buy") || msg.content.toLowerCase().startsWith("!invest") ) {
                messageContents = msg.member + " ";
                // Parse string
                var splitArray = msg.content.split(" ");
                if (splitArray.length < 3) {
                    messageContents += "Error: please enter the syntax like !buy <stock> <number>.";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                    return;
                }

                // Check syntax
                var stock = splitArray[1].toLowerCase();
                var shares = Number.parseInt(splitArray[2]);
                if (!(stock == "fire" || stock == "water" || stock == "air" || stock == "earth")) {
                     messageContents += "Error: stock needs to be either fire, water, air, or earth";
                     msg.channel.sendMessage(messageContents).catch(console.error);
                     return;
                }
                if (isNaN(shares)) {
                    messageContents += "Error: please input a valid number at the end.";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                    return;
                }

                var userTokenData = loadUserTokenData(msg.member.user);
                var stockData = jsonfile.readFileSync(stocksPath);

                if (userTokenData.tokens < stockData[stock]["value"] * shares) {
                    messageContents += "Error: this transaction costs " + (stockData[stock]["value"] * shares) + ", but you only have " + userTokenData.tokens + " tokens.";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                    return;
                } else {
                    updateUserTokenData(msg.member.user, "tokens", (stockData[stock]["value"] * shares * -1), true);
                    updateUserTokenData2D(msg.member.user, "shares", stock, shares, true);
                    updateStockMarket(stock, "shares", shares, true);
                    messageContents += "Transaction successful! You now have " + (userTokenData.tokens - (stockData[stock]["value"] * shares)) + " Rivals Tokens remaining.";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                }
                
            }




            if (msg.content.toLowerCase().startsWith("!sell")) {
                messageContents = msg.member + " ";

                // Parse string
                var splitArray = msg.content.split(" ");
                if (splitArray.length < 3) {
                    messageContents += "Error: please enter a date and a tournament number.";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                    return;
                }

                // Check syntax
                var stock = splitArray[1].toLowerCase();
                var shares = Number.parseInt(splitArray[2]);
                if (!(stock == "fire" || stock == "water" || stock == "air" || stock == "earth")) {
                     messageContents += "Error: stock needs to be either fire, water, air, or earth";
                     msg.channel.sendMessage(messageContents).catch(console.error);
                     return;
                }
                if (isNaN(shares)) {
                    messageContents += "Error: please input a valid number at the end.";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                    return;
                }

                var userTokenData = loadUserTokenData(msg.member.user);
                var stockData = jsonfile.readFileSync(stocksPath);

                if (shares > userTokenData["shares"][stock]) {
                    messageContents += "Error: you only have " + userTokenData["shares"][stock] + " shares for " + stock + ".";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                    return;
                } else {
                    updateUserTokenData(msg.member.user, "tokens", (stockData[stock]["value"] * shares), true);
                    updateUserTokenData2D(msg.member.user, "shares", stock, shares * -1, true);
                    updateStockMarket(stock, "shares", shares * -1, true);
                    messageContents += "Transaction successful! You now have " + (userTokenData.tokens + (stockData[stock]["value"] * shares)) + " Rivals Tokens remaining.";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                }
                
            }




            if (msg.content.toLowerCase().startsWith("!bonus")) {
                if (isAdmin(msg.member.user)) {

                    // Check if last word is a number
                    var lastWord = msg.content.split(" ").pop();
                    if (isNaN(lastWord)) {
                        messageContents = "Error: please input a valid number at the end.";
                        msg.channel.sendMessage(messageContents).catch(console.error);
                        return;
                    }

                    // Check if any mentioned users
                    var mentionArray = msg.mentions.users.array();
                    if (mentionArray.length == 0) {
                        messageContents = "Error: No users were mentioned.";
                        msg.channel.sendMessage(messageContents).catch(console.error);
                        return;
                    }

                    // Traverse through mentioned users and update tokens
                    for (var i = 0; i < mentionArray.length; i++) {
                        var userTokenData = loadUserTokenData(mentionArray[i]);
                        updateUserTokenData(mentionArray[i], "tokens", Number.parseInt(lastWord), true);
                    }

                    // Output success message
                    messageContents = lastWord + " has been added to the user(s') tokens";
                    msg.channel.sendMessage(messageContents).catch(console.error);
                }
            }




            if (msg.content.toLowerCase().startsWith("!tournament-links")) {
                if (isAdmin(msg.member.user)) {

                    // Parse message
                    var splitArray = msg.content.split(" ");
                    if (splitArray.length < 3) {
                        messageContents = "Error: please enter a date and a tournament number.";
                        msg.channel.sendMessage(messageContents).catch(console.error);
                        return;
                    }

                    // Check if date and integers
                    var date = splitArray[1];
                    var tournamentNumber = Number.parseInt(splitArray[2]);
                    if (isNaN(tournamentNumber)) {
                        messageContents = "Error: please input a valid number at the end.";
                        msg.channel.sendMessage(messageContents).catch(console.error);
                        return;
                    }

                    var parsedDate = parseDate(date);

                    // Messy Discord formatting :(
                    messageContents = 
                    "`-`  **" + monthToString(parsedDate.getMonth()) + " " + dayToString(parsedDate.getDate() - 4) + ", " + parsedDate.getFullYear() + "**\n*Central Championship Series #" + (tournamentNumber - 10) + "*\nBracket: http://narivals.challonge.com/ccs" + (tournamentNumber - 10) + "\n\n`-`  **" + monthToString(parsedDate.getMonth()) + " " + dayToString(parsedDate.getDate() - 3) + ", " + parsedDate.getFullYear() + "**\n*Western Championship Series #" + (tournamentNumber + 5) + "*\nBracket: http://narivals.challonge.com/wcs" + (tournamentNumber + 5) + "\n\n`-`  **" + monthToString(parsedDate.getMonth()) + " " + dayToString(parsedDate.getDate() - 1) + ", " + parsedDate.getFullYear() + "**\n*Eastern Championship Series #" + (tournamentNumber + 5) + "*\nBracket: http://narivals.challonge.com/ecs" + (tournamentNumber + 5) + "\n\n`-`  **" + monthToString(parsedDate.getMonth()) + " " + dayToString(parsedDate.getDate()) + ", " + parsedDate.getFullYear() + "**\n*National Championship Series #" + (tournamentNumber) + "*\nBracket: http://narivals.challonge.com/ncs" + (tournamentNumber);


                    channels.tournamentLinks.sendMessage(messageContents).catch(console.error);
                    msg.delete(3000);
                }
            }




            if (msg.content.toLowerCase().startsWith("!version")) {
                messageContents = "This is version v1.0.0, last updated March 09, 2017.";
                msg.channel.sendMessage(messageContents).catch(console.error);
            }
          

    }
});


/*=============================================
=                Helper Functions             =
=============================================*/

function loadUserTokenData(user) {
    var tokenDataFiles = fs.readdirSync(tokenDataPath);
    var userTokenDataFile;
    var userTokenData;

    // Attempt to find User Token Data File
    for (var i = 0; i < tokenDataFiles.length; i++) {
        if (tokenDataFiles[i] === user.id + ".json") {
            userTokenDataFile = tokenDataPath + "/" + tokenDataFiles[i];
            break;
        }
    }

    if (userTokenDataFile == null) {
        // Create new user token data if inexistant
        userTokenData = createUserTokenData(user);   
    } else {
        // Load existing token data
        userTokenData = jsonfile.readFileSync(userTokenDataFile);
    }

    return userTokenData;
}


function createUserTokenData(user) {
    var defaultTokenValues = {
        "id": user.id,
        "alias": user.username,
        "tokens": 150,
        "shares": {
            "water": 0,
            "fire": 0,
            "earth": 0,
            "air": 0
        }
    };
    jsonfile.writeFileSync(tokenDataPath + "/" + user.id + ".json", defaultTokenValues);
    return defaultTokenValues;
}


function updateUserTokenData(user, key, value, delta) {
    var userTokenData = loadUserTokenData(user);

    if (delta) {
        userTokenData[key] = userTokenData[key] + value;
    }
    else {
        userTokenData[key] = value;
    }

    jsonfile.writeFileSync(tokenDataPath + "/" + user.id + ".json", userTokenData);
    return userTokenData;
}

function updateUserTokenData2D(user, key, key2, value, delta) {
    var userTokenData = loadUserTokenData(user);

    if (delta) {
        userTokenData[key][key2] = userTokenData[key][key2] + value;
    }
    else {
        userTokenData[key][key2] = value;
    }

    jsonfile.writeFileSync(tokenDataPath + "/" + user.id + ".json", userTokenData);
    return userTokenData;
}

function updateStockMarket(stock, key, value, delta) {
    var stockData = jsonfile.readFileSync(stocksPath);

    if (delta)
        stockData[stock][key] = stockData[stock][key] + value;
    else
        stockData[stock][key] = value;

    jsonfile.writeFileSync(stocksPath, stockData);
    return stockData;
}


function isAdmin(user) {
    for (var i = 0; i < admins.length; i++) {
        if (user.id == admins[i]) {
            return true;
        }
    }
}


function easeCircleIn(x) {
    return -(Math.sqrt(1 - (x*x)) - 1);
}


// parse a date in yyyy-mm-dd format
function parseDate(input) {
    var parts = input.split('-');
    // new Date(year, month [, day [, hours[, minutes[, seconds[, ms]]]]])
    return new Date(parts[0], parts[1]-1, parts[2]); // Note: months are 0-based
}


function monthToString(month) {
    var monthStrings = new Array();
    monthStrings[0] = "January";
    monthStrings[1] = "February";
    monthStrings[2] = "March";
    monthStrings[3] = "April";
    monthStrings[4] = "May";
    monthStrings[5] = "June";
    monthStrings[6] = "July";
    monthStrings[7] = "August";
    monthStrings[8] = "September";
    monthStrings[9] = "October";
    monthStrings[10] = "November";
    monthStrings[11] = "December";
    return monthStrings[month]; 
}


function dayToString(day) {
    if (day == 1) {
        return "1st";
    } else if (day == 2) {
        return "2nd";
    } else if (day == 3) {
        return "3rd";
    } else {
        return day + "th";
    }
}