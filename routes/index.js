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

//    rooms.push(room);
    rooms[roomKey] = {};
    rooms[roomKey].name = roomKey;
    rooms[roomKey].minBuyIn = 50.00;
    rooms[roomKey].maxBuyIn = 250.00;
    rooms[roomKey].smallBlind = 1.00;
    rooms[roomKey].bigBlind = 2.00;

    rooms[roomKey].users = {};
    rooms[roomKey].users[username] = {};
    rooms[roomKey].users[username].name = username;
    rooms[roomKey].users[username].balance = 0.00;
    rooms[roomKey].users[username].admin = true;


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

      rooms[roomKey].users[username].name = username;
      rooms[roomKey].users[username].balance = 0.00;
      rooms[roomKey].users[username].admin = false;

      socket.emit("roomdata", rooms[roomKey]);
      io.sockets.in(roomKey).emit("userjoined", rooms[roomKey].users[username]);
      console.log(username + " joined room " + roomKey);
    } else {
      console.log(username + " tried to join unexisting room: " + room);
      socket.emit("noroomfound", room);
    }
    console.log(rooms);
  });

  socket.on("disconnect", function() {
    console.log("user has left");
    console.log(rooms);
  });
});

server.listen(3000, () => {
  console.log("Node app is running on port 3000");
});

module.exports = router;
