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
    rooms[roomKey].minBuyIn = 20.00;
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

      rooms[roomKey].users[username] = {};
      rooms[roomKey].users[username].name = username;
      rooms[roomKey].users[username].balance = 0.00;
      rooms[roomKey].users[username].admin = false;

      socket.emit("roomdata", rooms[roomKey]);
      io.sockets.in(roomKey).emit("userjoined", rooms[roomKey].users[username]);
      console.log(username + " joined room " + roomKey);
    } else {
      console.log(username + " tried to join unexisting room: " + roomKey);
      socket.emit("noroomfound", roomKey);
    }
    console.log(rooms);
  });

  socket.on("userbuyin", (roomKey, username, amount) => {
    rooms[roomKey].users[username].balance = rooms[roomKey].users[username].balance + amount;

    io.in(roomKey).emit("userrefilled", username, rooms[roomKey].users[username].balance);
  });

  socket.on("disconnectwithdata", (roomKey, username) => {
    socket.disconnect();
    delete rooms[roomKey].users[username];
    console.log(username + " left room " + roomKey);
    if (isEmpty(rooms[roomKey].users)) {
      delete rooms[roomKey];
      console.log("All users leaved room " + roomKey + ", room deleted");
    } else {
      io.sockets.in(roomKey).emit("userdisconnected", username);
    }
    console.log(rooms);
  });
});

let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
server.listen(port, () => {
  console.log("Node app is running on port 3000");
});

module.exports = router;


function isEmpty( obj ) {
  return Object.keys(obj).length === 0;
}