const express = require('express');
const router = express.Router();
http = require("http");
app = express();
server = http.createServer();
io = require("socket.io").listen(server);

let rooms = {};


router.get('/', function(req, res, next) {
  res.send("Chat server is running on port 3000");
});

io.on("connection", (socket) => {
  console.log("user connected");

  // User creates new room
  socket.on("createroom", (username) => {
    //generate random room key
    let roomKey = "";
    let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < 4; i++)
      roomKey += possible.charAt(Math.floor(Math.random() * possible.length));

    socket.username = username;
    socket.join(roomKey);

    rooms[roomKey] = {};
    rooms[roomKey].name = roomKey;
    rooms[roomKey].minBuyIn = 20.00;
    rooms[roomKey].maxBuyIn = 250.00;
    rooms[roomKey].smallBlind = 1.00;
    rooms[roomKey].bigBlind = 2.00;
    rooms[roomKey].currentBiggestBet = 0.00;// Keeps track of currently biggest bet, to let player know how much he should raise to match or double.
    rooms[roomKey].pot = 0.00;
    rooms[roomKey].stage = 0;// Games stage. 0 = not started, 1 = pre-fold, 2 = fold, 3 = turn, 4 = river.

    rooms[roomKey].users = {};
    rooms[roomKey].users[username] = {};
    rooms[roomKey].users[username].name = username;
    rooms[roomKey].users[username].id = socket.id;
    rooms[roomKey].users[username].balance = 0.00;
    rooms[roomKey].users[username].currentBet = 0.00;
    rooms[roomKey].users[username].admin = true;
    rooms[roomKey].users[username].seat = 0;// Players seat. 0 = SB, 1 = BB, 2 = UTG ... LAST = D
    rooms[roomKey].users[username].fold = false;


    console.log("Joined room: " + roomKey);

    socket.emit("createdroom", rooms[roomKey]);
    console.log(rooms);
  });

  // User joins existing room
  socket.on("joinroom", (data) => {
    const roomKey = data.roomKey.toUpperCase();
    const username = data.username;
    if(io.sockets.adapter.rooms[roomKey]) {

      socket.username = username;
      socket.join(roomKey);

      rooms[roomKey].users[username] = {};
      rooms[roomKey].users[username].name = username;
      rooms[roomKey].users[username].id = socket.id;
      rooms[roomKey].users[username].balance = 0.00;
      rooms[roomKey].users[username].currentBet = 0.00;
      rooms[roomKey].users[username].admin = false;
      rooms[roomKey].users[username].seat = Object.keys(rooms[roomKey].users).length-1;// Players seat. 0 = SB, 1 = BB, 2 = UTG ... LAST = D
      rooms[roomKey].users[username].fold = false;

      socket.emit("roomdata", rooms[roomKey]);
      socket.to(roomKey).emit("userjoined", rooms[roomKey].users[username]);
      console.log(username + " joined room " + roomKey);
    } else {
      console.log(username + " tried to join unexisting room: " + roomKey);
      socket.emit("noroomfound", roomKey);
    }
    console.log(rooms);
  });

  // Admin started the game
  socket.on("startgame", (roomKey) => {
    rooms[roomKey].stage = 1;
    rooms[roomKey].currentBiggestBet = rooms[roomKey].bigBlind;
    io.in(roomKey).emit("gamestarted", moveSeats(roomKey), (Object.keys(rooms[roomKey].users).length-1));

    if (Object.keys(rooms[roomKey].users).length > 2) {
      // If more than 2 players in the room, find UTG and send action request
      const nextUser = getUserBySeat(roomKey, 2);
      io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);// Lets client know who's turn it is to take action. Sends currently biggest bet, so player knows what is the minimum raise
    } else {
      // If only two players in the room, send action request to SB
      const nextUser = getUserBySeat(roomKey, 0);
      io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);// Lets client know who's turn it is to take action. Sends currently biggest bet, so player knows what is the minimum raise
    }
  });

  // Player checked
  socket.on("playerchecked", (roomKey, playerName, playerSeat) => {
    const roomsStage = rooms[roomKey].stage;

    io.in(roomKey).emit("playerchecked", playerName);

    if (roomsStage===1) {
      // Pre-flop, round ends on Big Blind
      if (playerSeat===getLastToAct(roomKey, 1).seat) {
        // Big Blind checked, who is the last player to act in pre-fold, since he checked, all bets are even and game can continue to fold
        endRound(roomKey);
        io.in(roomKey).emit("roundended", rooms[roomKey].pot);
        // New round started, it's Small Blinds turn
        const nextUser = getUserBySeat(roomKey, 0);
        io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);// Lets client know who's turn it is to take action. Sends currently biggest bet, so player knows what is the minimum raise
      } else {
        // Someone else than Big Blind checked, give turn to the next player
        const nextUser = getUserBySeat(roomKey, (playerSeat+1));
        io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);// Lets client know who's turn it is to take action. Sends currently biggest bet, so player knows what is the minimum raise
      }
    } else {
      // Post-flop, round ends on dealer
      if (playerSeat===getLastToAct(roomKey, (Object.keys(rooms[roomKey].users).length-1)).seat) {
        // Dealer checked, dealer is last player to act in post-fold, and since he checked, all bets ar even and game can continue to next stage
        if (roomsStage===4) {
          // Currently played stage was river, so the game wont continue to the next stage, instead it will ask the admin who won
          endRound(roomKey);
          io.in(roomKey).emit("roundended", rooms[roomKey].pot);
          resetFolds(roomKey);
          // Ask admin who won the game
          const admin = getRoomsAdmin(roomKey);
          io.in(admin.id).emit("pickwinner");
        } else {
          // Game can continue to the next stage
          endRound(roomKey);
          io.in(roomKey).emit("roundended", rooms[roomKey].pot);
          const nextUser = getUserBySeat(roomKey, 0);
          io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);// Lets client know who's turn it is to take action. Sends currently biggest bet, so player knows what is the minimum raise
        }
      } else {
        // Someone else than dealer checked, give turn to the next player
        const nextUser = getUserBySeat(roomKey, (playerSeat+1));
        io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);// Lets client know who's turn it is to take action. Sends currently biggest bet, so player knows what is the minimum raise
      }
    }
  });

  // Player folded
  socket.on("playerfolded", (roomKey, playerName, playerSeat) => {
    const roomsStage = rooms[roomKey].stage;
    rooms[roomKey].users[playerName].fold = true;
    io.in(roomKey).emit("playerfolded", playerName);

    // Find smallest bet and count players still in game(unfoldedCount)
    let unfoledCount = 0;
    let smallestBet;
    for (let user in rooms[roomKey].users) {
      const cUser = rooms[roomKey].users[user];
      if (!cUser.fold) {
        unfoledCount++;
      }
      if (smallestBet == null || cUser.currentBet < smallestBet) {
        smallestBet = cUser.currentBet;
      }
    }

    if (unfoledCount===1) {
      // All players but one folded, last player in game wins
      endRound(roomKey);
      io.in(roomKey).emit("roundended", rooms[roomKey].pot);
      const winners = [getLastUnfolded(roomKey)];
      io.in(roomKey).emit("winnersannounced", winners, rooms[roomKey].pot);
      rooms[roomKey].pot = 0.00;
    } else {
      if (roomsStage===1) {
        // Pre-flop, Big Blind is last to act
        if (playerSeat===getLastToAct(roomKey, 1).seat) {
          // Big Blind folded, last player to act
          if (smallestBet===rooms[roomKey].currentBiggestBet) {
            // Bets are equal, Game can continue to the next round
            endRound(roomKey);
            io.in(roomKey).emit("roundended", rooms[roomKey].pot);
            const nextUser = getUserBySeat(roomKey, 0);
            io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
          } else {
            // Bets inequal, give turn to the next player until all bets are equal or only one player left
            const nextUser = getUserBySeat(roomKey, (playerSeat+1));
            io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
          }
        } else {
          // Someone else than Big Blind acted in pre-flop round, turn to next player
          const nextUser = getUserBySeat(roomKey, (playerSeat+1));
          io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
        }
      } else {
        // Post-flop, round ends on Dealer
        if (playerSeat===getLastToAct(roomKey, (Object.keys(rooms[roomKey].users).length-1)).seat) {
          // Dealer folded, who is the last player to act in post-flop
          if (smallestBet===rooms[roomKey].currentBiggestBet) {
            // Bets equal, continue to next stage
            endRound(roomKey);
            io.in(roomKey).emit("roundended", rooms[roomKey].pot);
            if (roomsStage===4) {
              // River, more than one player in the game, all bets are equal, Admin should pick the winner
              resetFolds(roomKey);
              // Ask admin who won the game
              const admin = getRoomsAdmin(roomKey);
              io.in(admin.id).emit("pickwinner");
            } else {
              const nextUser = getUserBySeat(roomKey, 0);
              io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
            }
          } else {
            // Bets inequal, give turn to the next player until all bets are equal or only one player left
            const nextUser = getUserBySeat(roomKey, (playerSeat+1));
            io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
          }
        } else {
          // Someone else than Dealer folded, turn to next
          const nextUser = getUserBySeat(roomKey, (playerSeat+1));
          io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
        }
      }
    }
  });

  // Player called
  socket.on("playercalled", (roomKey, playerName, playerSeat) => {
    const roomsStage = rooms[roomKey].stage;
    const betRaise = rooms[roomKey].currentBiggestBet - rooms[roomKey].users[playerName].currentBet;
    rooms[roomKey].users[playerName].balance -= betRaise;
    rooms[roomKey].users[playerName].currentBet = rooms[roomKey].currentBiggestBet;
    io.in(roomKey).emit("playercalled", playerName);

    let smallestBet;
    for (let user in rooms[roomKey].users) {
      const cUser = rooms[roomKey].users[user];
      if (smallestBet == null || cUser.currentBet < smallestBet) {
        smallestBet = cUser.currentBet;
      }
    }

    if (roomsStage===1) {
      // Pre-flop, Big Blind is last to act
      if (playerSeat===getLastToAct(roomKey, 1).seat) {
        // Big Blind folded, last player to act
        if (smallestBet===rooms[roomKey].currentBiggestBet) {
          // Bets are equal, Game can continue to the next round
          endRound(roomKey);
          io.in(roomKey).emit("roundended", rooms[roomKey].pot);
          const nextUser = getUserBySeat(roomKey, 0);
          io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
        } else {
          // Bets inequal, give turn to the next player until all bets are equal or only one player left
          const nextUser = getUserBySeat(roomKey, (playerSeat+1));
          io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
        }
      } else {
        // Someone else than Big Blind acted in pre-flop round, turn to next player
        const nextUser = getUserBySeat(roomKey, (playerSeat+1));
        io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
      }
    } else {
      // Post-flop, round ends on Dealer
      if (playerSeat===getLastToAct(roomKey, (Object.keys(rooms[roomKey].users).length-1)).seat) {
        // Dealer folded, who is the last player to act in post-flop
        if (smallestBet===rooms[roomKey].currentBiggestBet) {
          // Bets equal, continue to next stage
          endRound(roomKey);
          io.in(roomKey).emit("roundended", rooms[roomKey].pot);
          if (roomsStage===4) {
            // River, more than one player in the game, all bets are equal, Admin should pick the winner
            resetFolds(roomKey);
            // Ask admin who won the game
            const admin = getRoomsAdmin(roomKey);
            io.in(admin.id).emit("pickwinner");
          } else {
            const nextUser = getUserBySeat(roomKey, 0);
            io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
          }
        } else {
          // Bets inequal, give turn to the next player until all bets are equal or only one player left
          const nextUser = getUserBySeat(roomKey, (playerSeat+1));
          io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
        }
      } else {
        // Someone else than Dealer folded, turn to next
        const nextUser = getUserBySeat(roomKey, (playerSeat+1));
        io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
      }
    }
  });

  // Player raised
  socket.on("playerraised", (roomKey, playerName, playerSeat, raisedBet) => {
    const ownBetRaise = raisedBet - rooms[roomKey].users[playerName].currentBet;
    rooms[roomKey].currentBiggestBet = raisedBet;
    rooms[roomKey].users[playerName].currentBet = raisedBet;
    rooms[roomKey].users[playerName].balance -= ownBetRaise;

    io.in(roomKey).emit("playerraised", playerName, raisedBet);

    const nextUser = getUserBySeat(roomKey, (playerSeat+1));
    io.in(roomKey).emit("turngiven", nextUser.name, rooms[roomKey].currentBiggestBet, rooms[roomKey].stage);
  });

  // Admin picked the winners
  socket.on("winnerspicked", (roomKey, winnerNames) => {
    const prize = (rooms[roomKey].pot)/(winnerNames.length);
    rooms[roomKey].pot = 0.00;
    let winners = [];
    winnerNames.forEach(function (item, index, array) {
      rooms[roomKey].users[item].balance += prize;
      winners.push(rooms[roomKey].users[item]);
    });
    io.in(roomKey).emit("winnersannounced", winners, prize);
  });

  socket.on("userbuyin", (roomKey, username, amount) => {
    rooms[roomKey].users[username].balance = rooms[roomKey].users[username].balance + amount;

    io.in(roomKey).emit("userrefilled", username, rooms[roomKey].users[username].balance);
  });

  // Remove user from data when client disconnects, user was last in the room, remove room from the data too.
  socket.on("disconnectwithdata", (roomKey, username) => {
    socket.disconnect();
    delete rooms[roomKey].users[username];
    console.log(username + " left room " + roomKey);
    if (isEmpty(rooms[roomKey].users)) {
      delete rooms[roomKey];
      console.log("All users leaved room " + roomKey + ", room deleted");
    } else {
      socket.to(roomKey).emit("userdisconnected", username);
    }
    console.log(rooms);
  });
});

let port = process.env.PORT;
if (port == null || port === "") {
  port = 3000;
}
server.listen(port, () => {
  console.log("Node app is running on port 3000");
});



function isEmpty( obj ) {
  return Object.keys(obj).length === 0;
}

// Collects users bets into rooms pot, changes games stage/state
function endRound(roomKey) {
  let roundsPot = 0.00;
  for (let user in rooms[roomKey].users) {
    const cUser = rooms[roomKey].users[user];
    roundsPot += cUser.currentBet;
    rooms[roomKey].users[cUser.name].currentBet = 0.00;
  }
  rooms[roomKey].pot += roundsPot;
  rooms[roomKey].currentBiggestBet = 0.00;

  if (rooms[roomKey].stage != 4) {
    rooms[roomKey].stage++;
  }
}

// If requested User folded, get next unfolded User
function getUserBySeat(roomKey, nextSeat) {
  if (nextSeat === (Object.keys(rooms[roomKey].users).length)) {
    nextSeat = 0;
  }
  for (let user in rooms[roomKey].users) {
    const cUser = rooms[roomKey].users[user];
    if (cUser.seat === nextSeat) {
      if (cUser.fold) {
        return getUserBySeat(roomKey, (nextSeat+1));
      } else {
        return cUser;
      }
    }
  }
}

function getRoomsAdmin(roomKey) {
  for (let user in rooms[roomKey].users) {
    const cUser = rooms[roomKey].users[user];
    if (cUser.admin) {
      return cUser;
    }
  }
}

function resetFolds(roomKey) {
  for (let user in rooms[roomKey].users) {
    const cUser = rooms[roomKey].users[user];
    cUser.fold = false;
  }
}

function getLastUnfolded(roomKey) {
  for (let user in rooms[roomKey].users) {
    const cUser = rooms[roomKey].users[user];
    if (!cUser.fold) {
      return cUser;
    }
  }
}

// Last to act player who is not folded yet
// For example if it is pre-flop, last to act is 1/BigBlind, if he folded and someone else raised, last to act in the round is 0/SmallBlind, if he did not fold yet.
function getLastToAct(roomKey, lastKnownUnfolded) {
  for (let user in rooms[roomKey].users) {
    const cUser = rooms[roomKey].users[user];
    if (cUser.seat===lastKnownUnfolded) {
      if (!cUser.fold) {
        return cUser;
      } else {
        if (lastKnownUnfolded===0) {
          return getLastToAct(roomKey, (Object.keys(rooms[roomKey].users).length-1));
        } else {
          return getLastToAct(roomKey, (lastKnownUnfolded-1));
        }
      }
    }
  }
}

// Move D, SB, BB to the next players, returns array of players names in their seating order
function moveSeats(roomKey) {
    let newSeats = [];
    for (let user in rooms[roomKey].users) {
        const cUser = rooms[roomKey].users[user];
        if (cUser.seat === (Object.keys(rooms[roomKey].users).length-1)) {
            // Dealer, moves to SB
            cUser.seat = 0;
            cUser.currentBet = rooms[roomKey].smallBlind;
            newSeats[0] = cUser.name;
        } else if (cUser.seat === 0) {
            // SB, moves to BB
            cUser.seat++;
            cUser.currentBet = rooms[roomKey].bigBlind;
            newSeats[cUser.seat] = cUser.name;
        } else {
            cUser.seat++;
            newSeats[cUser.seat] = cUser.name;
        }
    }
    return newSeats;
}

module.exports = router;