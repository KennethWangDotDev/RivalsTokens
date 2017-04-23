/**
 * ============================
 * Setup
 * ============================
 */

const jsonfile = require('jsonfile');
const fs = require('fs');
const cfg = require('../config.js');
const Discord = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const db = require('sqlite');
const dedent = require('dedent-js');
const Promise = require('bluebird');

const bot = new Discord.Client();
const dataPath = path.join(__dirname, '../data');
const sqlPath = `${dataPath}/sqlite.db`;
let server;
const tokenChannels = [];
let marketOpen = true;


bot.login(cfg.token).then(() => console.log('Bot logged in succesfully!'));

bot.on('ready', () => {
    console.log('Initializing starting variables...');
    server = bot.guilds.find('name', cfg.serverName);
    if (!server) {
        console.error(`Server ${cfg.serverName} not found.`);
        process.exit(-1);
    }
    
    cfg.tokenChannels.forEach((channel) => {
        const foundChannel = server.channels.find('name', channel);
        if (!foundChannel) {
            console.error(`Channel ${channel} not found.`);
            process.exit(-1);
        } else {
            tokenChannels.push(foundChannel);
        }
    });
    
    /* ----------  Database Initialization ----------*/
    Promise.resolve()
    .then(() => db.open(sqlPath, { Promise }))
    .then(() => {
        db.run('CREATE TABLE IF NOT EXISTS Wallet (DiscordID TEXT PRIMARY KEY, Tokens INT, ChallongeUsername TEXT)');
        db.run('CREATE TABLE IF NOT EXISTS UserShares (DiscordID TEXT, StockID INT, Amount INT, UNIQUE (DiscordID, StockID))');
        db.run('CREATE TABLE IF NOT EXISTS StockMarket (StockID INT PRIMARY KEY, Name TEXT, Value INT, TotalShares INT)')
        .then(() => {
            db.run('INSERT OR IGNORE INTO StockMarket (StockID, Name, Value, TotalShares) VALUES (0, "Fire", 100, 0)');
            db.run('INSERT OR IGNORE INTO StockMarket (StockID, Name, Value, TotalShares) VALUES (1, "Water", 100, 0)');
            db.run('INSERT OR IGNORE INTO StockMarket (StockID, Name, Value, TotalShares) VALUES (2, "Earth", 100, 0)');
            db.run('INSERT OR IGNORE INTO StockMarket (StockID, Name, Value, TotalShares) VALUES (3, "Air", 100, 0)');
        });
    })
    .catch(err => console.error(err.stack));

    console.log(`Ready! Serving for a total of ${bot.users.size} users!`);
});


/**
 * ============================
 * Helper Functions
 * ============================
 */

/**
 * Inserts new user in database with default values
 * @param  {string} userID - Discord ID of user
 * @return {Object} - Returns wallet object with default values
 */
function createUserTokenData(userID) {
    const promises = [
        db.run('INSERT OR IGNORE INTO Wallet (DiscordID, Tokens, ChallongeUsername) VALUES (?, 150, null)', [userID]),
        db.run('INSERT OR IGNORE INTO UserShares (DiscordID, StockID, Amount) VALUES (?, 0, 0)', [userID]),
        db.run('INSERT OR IGNORE INTO UserShares (DiscordID, StockID, Amount) VALUES (?, 1, 0)', [userID]),
        db.run('INSERT OR IGNORE INTO UserShares (DiscordID, StockID, Amount) VALUES (?, 2, 0)', [userID]),
        db.run('INSERT OR IGNORE INTO UserShares (DiscordID, StockID, Amount) VALUES (?, 3, 0)', [userID]),
    ];
    
    return Promise.all(promises)
    .then(() => {
        const defaultUserTokenObject = {};
        defaultUserTokenObject.discordID = userID;
        defaultUserTokenObject.tokens = 150;
        defaultUserTokenObject.challongeUsername = null;
        return defaultUserTokenObject;
    })
    .catch(err => console.error(Error(err)));
}

/**
 * Loads the wallet data for the specified user.
 * @param  {string} userID - Discord ID of user.
 * @return {Promise.<Object, Error>} - Promise that returns user wallet as an object,
 *                                   or an error if rejected.
 */
function loadUserWallet(userID) {
    return db.get(`SELECT DiscordID, Tokens, ChallongeUsername FROM Wallet WHERE DiscordID = ${userID}`)
    .then((row) => {
        if (!row) {
            return createUserTokenData(userID)
            .catch(err => console.error(Error(err)));
        } else {
            const userTokenObject = {};
            userTokenObject.discordID = row.DiscordID;
            userTokenObject.tokens = row.Tokens;
            userTokenObject.challongeUsername = row.ChallongeUsername;
            return userTokenObject;
        }
    })
    .catch(err => console.error(Error(err)));
}

/**
 * Loads the wallet data by matching Challonge ID.
 * @param  {string} challongeID - Challonge ID of user.
 * @return {Promise.<Object, Error>} - Promise that returns user wallet as an object if found,
 *                                   false if not found, or an error if rejected.
 */
function loadUserWalletFromChallonge(challongeID) {
    return db.get(`SELECT DiscordID, Tokens, ChallongeUsername FROM Wallet WHERE ChallongeUsername = '${challongeID}'`)
    .then((row) => {
        if (!row) {
            return false;
        }
        const userTokenObject = {};
        userTokenObject.discordID = row.DiscordID;
        userTokenObject.tokens = row.Tokens;
        userTokenObject.challongeUsername = row.ChallongeUsername;
        return userTokenObject;
    })
    .catch(err => console.error(Error(err)));
}

/**
 * Associates a Discord user with a Challonge user.
 * @param  {string} discordID - Discord ID of user.
 * @param  {string} challongeID - Chalonge ID of user.
 * @return {Promise.<Statement, Error>} - Promise that returns the successful SQL statement,
 *                                   or an error if rejected.
 */
function linkChallonge(discordID, challongeID) {
    createUserTokenData(discordID)
    .then(() => {
        return db.run(`UPDATE Wallet SET ChallongeUsername = '${challongeID}' WHERE DiscordID = ${discordID}`)
                .catch(err => console.error(Error(err)));
    })
    .catch(err => console.error(Error(err)));
}

/**
 * Adds the specified user's Rivals Tokens with value.
 * @param  {string} userID  - Discord ID of user.
 * @param  {int} value - Amount to add. Can be negative.
 * @return {Promise.<Statement, Error>} - Promise that returns the successful SQL statement,
 *                                   or an error if rejected.
 */
function updateUserTokens(userID, value) {
    return db.run(`UPDATE Wallet SET Tokens = Tokens + ${value} WHERE DiscordID = ${userID}`)
    .catch(err => console.error(Error(err)));
}

/**
 * Loads the token data for the specified user.
 * @param  {string} userID - Discord ID of user.
 * @return {Promise.<Object, Error>} - Promise that returns user token as an object,
 *                                   or an error if rejected.
 */
function loadUserShares(userID) {
    return db.all(`SELECT UserShares.StockID, Name, Amount FROM UserShares 
                JOIN StockMarket ON UserShares.StockID = StockMarket.StockID 
                WHERE DiscordID = ${userID} ORDER BY StockMarket.StockID ASC`)
    .then((rows) => {
        const userShareObject = {};
        if (rows.length === 0) {
            Object.assign(userShareObject, createUserTokenData(userID).shares);
        } else {
            for (const row of rows) {
                userShareObject[row.Name] = row.Amount;
            }
        }
        return userShareObject;
    })
    .catch(err => console.error(Error(err)));
}

/**
 * Adds the specified user's specified stock with an amount.
 * @param  {string} userID - Discord ID of user.
 * @param  {int} stockID - ID of the stock.
 * @param  {int} amount - Amount to add.
 * @return {Promise.<Statement, Error>} - Promise that returns the successful SQL statement,
 *                                   or an error if rejected.
 */
function updateUserShares(userID, stockID, amount) {
    return db.run(`UPDATE UserShares SET Amount = Amount + ${amount} WHERE DiscordID = ${userID} AND StockID = ${stockID}`)
    .catch(err => console.error(Error(err)));
}

/**
 * Loads the Stock Market from the database.
 * @return {Promise.<Object, Error>} - Promise that returns the stock market Object if successful,
 *                                   or an error if rejected.
 */
function loadStockMarket() {
    return db.all('SELECT * FROM StockMarket ORDER BY StockID ASC')
    .then((rows) => {
        const stockObject = {};
        for (const row of rows) {
            stockObject[row.Name] =
                { value: row.Value, totalShares: row.TotalShares, id: row.StockID };
        }
        return stockObject;
    })
    .catch(err => console.error(Error(err)));
}

/**
 * Updates the Stock Market with the specified value
 * @param  {string} stockID - The ID of the stock to update.
 * @param  {int} valueIncrease - Change of the value of the stock.
 * @param  {int} totalSharesIncrease - Change of the total shares of the stock.
 * @return {Promise.<Statement, Error>} - Promise that returns the successful SQL statement,
 *                                   or an error if rejected.
 */
function updateStockMarket(stockID, valueIncrease, totalSharesIncrease) {
    return db.run(`UPDATE StockMarket SET Value = Value + ${valueIncrease}, TotalShares = TotalShares + ${totalSharesIncrease} WHERE StockID = ${stockID}`)
    .catch(err => console.error(Error(err)));
}

/**
 * Helper function to check whether specified user is an administrator.
 * @param  {string}  userID - Discord ID of user.
 * @return {Boolean} - Returns true if the specified user is an administrator.
 *                     Otherwise returns false.
 */
function isAdmin(userID) {
    for (const admin of cfg.admins) {
        if (userID === admin) {
            return true;
        }
    }
    return false;
}

/**
 * Easing formula using x^1.5, where x is a number from 0 to 1.
 * x is calculated as a fraction using current and total
 * @param  {int} current - Current place.
 * @param  {int} total - Total number of participants.
 * @return {float} - Returns an eased number between 0 and 1.
 */
function tourneyEasing(current, total) {
    return (((total + 1) - current) / total) ** 1.5;
}

/**
 * ============================
 * Message Parsing
 * ============================
 */

bot.on('message', (msg) => {
    
    const command = msg.content.toLowerCase();
    if (tokenChannels.includes(msg.channel)) {
        
        /* ----------  Display User's Token  ----------*/
        if (command.startsWith('!token')) {
            loadUserWallet(msg.member.user.id)
            .then((userTokenData) => {
                const messageContent = `${msg.member} You currently have ${userTokenData.tokens} Rivals Tokens.`;
                msg.channel.sendMessage(messageContent).catch(console.error);
            });
        }

        /* ----------  Display Global Stock Market  ----------*/
        if ((command.startsWith('!stock')) || (command.startsWith('!market'))) {
            loadStockMarket()
            .then((market) => {
                let messageContent = '';
                let totalShares = 0;
                for (const stock in market) {
                    if (Object.prototype.hasOwnProperty.call(market, stock)) {
                        messageContent += `**${stock}** is valued at **${market[stock].value}** with a total of **${market[stock].totalShares}** outstanding shares.\n`;
                        totalShares += market[stock].totalShares;
                    }
                }
                messageContent += `\n**Overall**, there is currently a total of **${totalShares}** outstanding shares.`;
                msg.channel.sendMessage(messageContent).catch(console.error);
            })
            .catch(err => console.error(Error(err)));
        }

        /* ----------  Display User's Shares  ----------*/
        if (command.startsWith('!share')) {
            Promise.all([loadUserShares(msg.member.user.id), loadStockMarket()])
            .then(([shares, market]) => {
                let messageContent = `${msg.member}\n`;
                for (const share in shares) {
                    if (Object.prototype.hasOwnProperty.call(shares, share)) {
                        messageContent += `**${share}**: ${shares[share]} shares. Total value of ${market[share].value * shares[share]}.\n`;
                    }
                }
                msg.channel.sendMessage(messageContent).catch(console.error);
            })
            .catch(err => console.error(Error(err)));
        }


        /* ----------  Purchase and Selling Stocks  ----------*/
        if (command.startsWith('!purchase') ||
                command.startsWith('!buy') ||
                command.startsWith('!invest') ||
                command.startsWith('!sell')) {
            let messageContent = `${msg.member} `;
        
             // Error Checking => Market is open.
            if (!marketOpen) {
                messageContent += 'The market is currently closed at the moment, most likely due to a tournament going on. Try again later!';
                msg.channel.sendMessage(messageContent).catch(console.error);
                return;
            }
            
            // Error Checking => Proper length.
            const splitArray = msg.content.split(' ');
            if (splitArray.length < 3) {
                messageContent += 'Error: please enter the syntax like !buy/sell <stock> <number>.';
                msg.channel.sendMessage(messageContent).catch(console.error);
                return;
            }
            
            // Error Checking => Stock name.
            const stock = splitArray[1].charAt(0).toUpperCase() + splitArray[1].toLowerCase().slice(1);
            if (!(stock === 'Fire' || stock === 'Water' || stock === 'Air' || stock === 'Earth')) {
                messageContent += 'Error: stock needs to be either Fire, Water, Air, or Earth';
                msg.channel.sendMessage(messageContent).catch(console.error);
                return;
            }
            
            // Error Checking => Number check.
            const shares = Number(splitArray[2]);
            if (isNaN(shares)) {
                messageContent += 'Error: please input a valid number at the end.';
                msg.channel.sendMessage(messageContent).catch(console.error);
                return;
            }
            
            if (command.startsWith('!sell')) {
                
                // Sell
                Promise.all([loadUserWallet(msg.member.user.id), loadUserShares(msg.member.user.id), loadStockMarket()])
                .then(([userWallet, userShares, stockMarket]) => {
                    if (userShares[stock] < shares) {
                        messageContent += `Error: you only have ${userShares[stock]} ${stock} shares.`;
                        msg.channel.sendMessage(messageContent).catch(console.error);
                    } else {
                        updateUserTokens(msg.member.user.id, stockMarket[stock].value * shares);
                        updateUserShares(msg.member.user.id, stockMarket[stock].id, -1 * shares);
                        updateStockMarket(stockMarket[stock].id, 0, -1 * shares);
                        messageContent += `Transaction successful! You now have a total of ${userWallet.tokens + (stockMarket[stock].value * shares)} Rivals Tokens.`;
                        msg.channel.sendMessage(messageContent).catch(console.error);
                    }
                })
                .catch(err => console.error(Error(err)));
                
            } else {
                
                // Purchase
                Promise.all([loadUserWallet(msg.member.user.id), loadStockMarket()])
                .then(([userWallet, stockMarket]) => {
                    if (userWallet.tokens < stockMarket[stock].value * shares) {
                        messageContent += `Error: this transaction costs ${stockMarket[stock].value * shares}, but you only have ${userWallet.tokens} tokens.`;
                        msg.channel.sendMessage(messageContent).catch(console.error);
                    } else {
                        updateUserTokens(msg.member.user.id, -1 * stockMarket[stock].value * shares);
                        updateUserShares(msg.member.user.id, stockMarket[stock].id, shares);
                        updateStockMarket(stockMarket[stock].id, 0, shares);
                        messageContent += `Transaction successful! You now have ${userWallet.tokens - (stockMarket[stock].value * shares)} Rivals Tokens remaining.`;
                        msg.channel.sendMessage(messageContent).catch(console.error);
                    }
                })
                .catch(err => console.error(Error(err)));
                
            }
        }
        

        /* ----------  Give Bonus Stocks (Admin Command)  ----------*/
        if (command.startsWith('!bonus')) {
            if (isAdmin(msg.member.user.id)) {
                
                // Error Checking => Number check.
                const lastWord = msg.content.split(' ').pop();
                if (isNaN(lastWord)) {
                    const messageContent = 'Error: please input a valid number at the end.';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }

                // Error Checking => Mentioned users.
                const mentionArray = msg.mentions.users.array();
                if (mentionArray.length === 0) {
                    const messageContent = 'Error: No users were mentioned.';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }

                // Traverse through mentioned users and update tokens
                for (const user of mentionArray) {
                    updateUserTokens(user.id, Number(lastWord));
                }
                const messageContent = `${lastWord} has been added to the user(s') tokens`;
                msg.channel.sendMessage(messageContent).catch(console.error);
            }
        }


        /* ----------  Toggle Market On/Off (Admin Command)  ----------*/
        if (command.startsWith('!toggle-market')) {
            if (isAdmin(msg.member.user.id)) {
                let messageContent = '';
                marketOpen = !marketOpen;
                if (marketOpen) {
                    messageContent = 'The market is now open, and the value of stocks has been updated.';
                } else {
                    messageContent = 'The market is now closed, and will open once the tournament ends.';
                }
                msg.channel.sendMessage(messageContent).catch(console.error);
                msg.delete(0);
            }
        }

        /* ----------  Award Tournament Participation (Admin Command)  ----------*/
        if (command.startsWith('!award-token')) {
            if (isAdmin(msg.member.user.id)) {
                let messageContent = '';
                
                // Error Checking => Proper length.
                const splitArray = msg.content.split(' ');
                if (splitArray.length < 2) {
                    messageContent = 'Error: please follow the syntax !award-tokens <tournament>';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }

                const tourney = splitArray[1].toLowerCase();
                fetch(`https://api.challonge.com/v1/tournaments/${cfg.challongeSubdomain}-${tourney}/participants.json?api_key=${cfg.challongeKey}`)
                .then(res => res.json())
                .then((participants) => {
                    
                    // Remove all entries where the participant's final rank is null.
                    // This refers to players who have disqualified.
                    for (let i = 0; i < participants.length; i += 1) {
                        if (participants[i].participant.final_rank == null) {
                            participants.splice(i, 1);
                            i -= 1; // Maintain proper indexing since we are splicing in a loop.
                        }
                    }
                    
                    /*
                    
                    The reward that each participation get is from the following formula:
                    [Participation Reward] + ([Tournament Weight] * [Participants Count] * [Easing Formula])
                    
                    Easing (http://easings.net/) is used to provide a non-linear rate of reward.
                    The easing formula we use is f(x)=x^1.5 from [0, 1)
                    The variable x is derived from a participant's placing:
                        x => 1 - ([Participant Placing] / [Participants Count])
                    
                    The result of the easing formula is a float from 0 to 1. It is then multiplied by the
                    participant count and the tournament weight. Add the result of that to the base tournament
                    participant reward, and you get the final reward.
                    
                     */
                    
                    let participationReward;
                    let tournamentWeight;
                    if (tourney.includes('ncs')) {
                        participationReward = 200;
                        tournamentWeight = 25;
                    } else if (tourney.includes('wcs') || tourney.includes('ecs') || tourney.includes('ccs')) {
                        participationReward = 100;
                        tournamentWeight = 20;
                    } else {
                        participationReward = 50;
                        tournamentWeight = 15;
                    }
                    
                    const promiseArray = [];
                    for (const { participant } of participants) {
                        const reward = Math.ceil(participationReward + (tournamentWeight * participants.length * tourneyEasing(participant.final_rank, participants.length)));
                        // const promise = loadUserWalletFromChallonge(participant.challonge_username)
                        const promise = loadUserWalletFromChallonge(participant.challonge_username)
                        .then((userWallet) => {
                            if (userWallet) {
                                updateUserTokens(userWallet.discordID, reward)
                                .catch(err => console.error(Error(err)));
                                return `Award: <@${userWallet.discordID}> => ${reward}`;
                            }
                            return `ERROR: ${participant.challonge_username} X=> ${reward}`;
                        })
                        .catch(err => console.error(Error(err)));
                        promiseArray.push(promise);
                    }
                    
                    Promise.all(promiseArray)
                    .then((message) => {
                        msg.channel.sendMessage(message.join('\n')).catch(console.error);
                    });
                });
            }
        }

        
        /* ----------  Update stock (Admin Command)  ----------*/
        if (command.startsWith('!update-stock')) {
            if (isAdmin(msg.member.user.id)) {
                // Error Checking => Proper length.
                const splitArray = msg.content.split(' ');
                if (splitArray.length < 3) {
                    const messageContent = 'Error: please follow the syntax !update-stock <stock> <amount>';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }

                // Error Checking => Stock name.
                const stock = splitArray[1].toLowerCase();
                if (!(stock === 'fire' || stock === 'water' || stock === 'air' || stock === 'earth')) {
                    const messageContent = 'Error: stock needs to be either Fire, Water, Air, or Earth';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }
                
                // Error Checking => Number
                if (isNaN(splitArray[2])) {
                    const messageContent = 'Error: please input a valid number at the end.';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }
                
                let stockID;
                if (stock === 'fire') {
                    stockID = 0;
                } else if (stock === 'water') {
                    stockID = 1;
                } else if (stock === 'earth') {
                    stockID = 2;
                } else if (stock === 'air') {
                    stockID = 3;
                }
                
                const messageContent = "Successful!";
                updateStockMarket(stockID, splitArray[2], 0)
                .then(() =>  msg.channel.sendMessage(messageContent).catch(console.error));
            }
        }
        
        
        /* ----------  Link Challonge to Discord (Admin Command)  ----------*/
        if (command.startsWith('!link-challonge')) {
            if (isAdmin(msg.member.user.id)) {
                // Error Checking => Proper length.
                const splitArray = msg.content.split(' ');
                if (splitArray.length < 3) {
                    const messageContent = 'Error: please follow the syntax !link-challonge <@user> <challonge username>';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }

                // Error Checking => Mentioned users.
                const mentionArray = msg.mentions.users.array();
                if (mentionArray.length === 0) {
                    const messageContent = 'Error: No users were mentioned.';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }
                
                createUserTokenData(mentionArray[0].id)
                .then(() => linkChallonge(mentionArray[0].id, splitArray[2]))
                .then(() => msg.channel.sendMessage('Successful!').catch(console.error));
            }
        }
    }
    
    /**
     * Commands below are not channel-restricted.
     */
    
    /* ----------  Display Current Version  ----------*/
    if (command.startsWith('!rank') || command.startsWith('!rating') || command.startsWith('!info')) {
        // Error Checking => Mentioned users.
        const mentionArray = msg.mentions.users.array();
        if (mentionArray.length === 0) {
            const messageContent = 'Error: No users were mentioned.';
            msg.channel.sendMessage(messageContent).catch(console.error);
            return;
        }
        
        loadUserWallet(mentionArray[0].id)
        .then((userTokenData) => {
            // Error Checking => Linked Challonge Username
            if (!userTokenData.challongeUsername) {
                const messageContent = 'Error: User does not have a linked Challonge account.';
                msg.channel.sendMessage(messageContent).catch(console.error);
                return;
            }
            
            fetch(`http://rivalsrankings.com/Player/${userTokenData.challongeUsername}`)
            .then(res => res.json())
            .then((playerInfo) => {
                const { alias, mains, conservativeRating, ranking, matchWinsCount, matchLossesCount, winPercentage } = playerInfo;
                
                // Error Checking => Listed On RivalsRankings
                if (!alias) {
                    const messageContent = 'Error: User is not listed on RivalsRankings';
                    msg.channel.sendMessage(messageContent).catch(console.error);
                    return;
                }
                
                const messageContent = 
                dedent(`**Player Name:** ${alias}
                **Global Rank:** ${ranking}
                **Rating:** ${Math.round(conservativeRating)}
                **Characters:** ${mains.length > 0 ? mains.join(', ') : 'Unlisted'}
                **Wins:** ${matchWinsCount}
                **Losses:** ${matchLossesCount}
                **Win Percentage:** ${Math.round(winPercentage)}%`);
                msg.channel.sendMessage(messageContent).catch(console.error);
            });
            
        });
        
    }

    /* ----------  Display Current Version  ----------*/
    if (command.startsWith('!version')) {
        const messageContent = 'This is version v2.1.0, last updated April 23, 2017.';
        msg.channel.sendMessage(messageContent).catch(console.error);
    }
    
    /* ----------  Meme  ----------*/
    if (((command.includes('cars') && msg.content.includes('TO')) || command.includes('literal who')) && !(msg.content.includes('has done nothing'))) {
        const messageContent = 'Why is Cars a TO and I am not? Cars is a disrespectful, immature, biased person. He has done nothing for this community. Meanwhile I have hosted the biggest Rivals tournament in years and I get no apprecation or respect for it. I have even been called names such as, and I quote, "a literal who".';
        msg.channel.sendMessage(messageContent).catch(console.error);
    } else if ((command.includes('dan') && (command.includes('biased') || command.includes('furry')) && !(command.includes('appreciation')))) {
        const messageContent = 'Why is Dan a Dev and I am not? Dan is a disrespectful, immature, biased person. He has done nothing for this community. Meanwhile I have beta tested the biggest Rivals patch in years and I get no appreciation or respect for it. I have ever been called names such as, and I quote, "A furry".';
        msg.channel.sendMessage(messageContent).catch(console.error);
    }
    
    const johns = require(`${dataPath}/johns`);
    if (command.includes('john')) {
        const messageContent = johns.prep[Math.floor(Math.random()*johns.prep.length)] + ' ' 
                                + johns.subjects[Math.floor(Math.random()*johns.subjects.length)] + ' '
                                + johns.problems[Math.floor(Math.random()*johns.problems.length)];
        msg.channel.sendMessage(messageContent).catch(console.error);
    }
});
