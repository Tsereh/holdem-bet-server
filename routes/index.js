const express = require('express');
const router = express.Router();
http = require("http");
app = express();
server = http.createServer();
io = require("socket.io").listen(server);

let rooms = [];


router.get('/', function(req, res, next) {
  res.send("Chat server is running on port 3000");
});

io.on("connection", (socket) => {
  console.log("user connected");

  // User creates new room
  socket.on("createroom", (username) => {
    console.log(rooms);
    //generate random room key
    let room = "";
    let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let i = 0; i < 4; i++)
      room += possible.charAt(Math.floor(Math.random() * possible.length));

    rooms.push(room);
    console.log("Created room: " + room);

    socket.username = username;
    socket.join(room);
    console.log("Joined room: " + room);

    io.sockets.in(room).emit("createdroom", room);
  });

  // User joins existing room
  socket.on("joinroom", (data) => {
    const room = data.roomKey.toUpperCase();
    const username = data.username;
    if(rooms.includes(room)) {
      let users = [];
      const clients = io.sockets.adapter.rooms[room].sockets;
      for (let clientId in clients) {
        const clientSocket = io.sockets.connected[clientId];

        users.push(clientSocket.username);
      }

      socket.username = username;

      socket.join(room);
      socket.emit("usersinroom", users);
      io.sockets.in(room).emit("userjoined", username);
      console.log(username + " joined room " + room);
    } else {
      console.log(username + " tried to join unexisting room: " + room);
      socket.emit("noroomfound", room);
    }
  });

  socket.on("disconnect", function() {
    console.log("user has left");
  });
});

server.listen(3000, () => {
  console.log("Node app is running on port 3000");
});

module.exports = router;
