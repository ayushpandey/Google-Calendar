/******************************************************************************
 * Libraries
 *****************************************************************************/
var express = require("express");
var oauth = require('oauth');
var MongoClient = require('mongodb').MongoClient;
var gcal = require('google-calendar');
var path    = require("path");



/******************************************************************************
 * Variables
 *****************************************************************************/
var oa;
var app = express();


var clientId = '416645554428-r3932c7aneqskefeskpgj72ug41r2gef.apps.googleusercontent.com';
var clientSecret = 'pNJXuDOrgKp6I2xhwZaJc-Xb';
var scopes = 'https://www.googleapis.com/auth/calendar.readonly';
var googleUserId;
var accessToken;
var refreshToken;
var baseUrl="http://localhost:3000";
var data={
    'google_access_token':' ',
    'google_access_token_expiration':' ',
    'google_refresh_token':' '
};


/******************************************************************************
 * Database Setup
 *****************************************************************************/
var database;

MongoClient.connect('mongodb://localhost:27017/data', function(err, db) {
    if (err) {
        console.log(err);
    }
    else
    {
        database=db;
        console.log("Connected");
    }

});




/******************************************************************************
 * Methods
 *****************************************************************************/

app.get('/', function(request, response){
    oa = new oauth.OAuth2(clientId,
        clientSecret,
        "https://accounts.google.com/o",
        "/oauth2/auth",
        "/oauth2/token");
    if(database)
    {
        response.redirect(oa.getAuthorizeUrl({scope:scopes, response_type:'code', redirect_uri:"http://localhost:3000/callback", access_type:'offline',user_id:googleUserId}));

    }
});





app.get('/events',function (request,response) {

    database.collection('events').find().forEach(function(event){response.render('index.ejs',{data:event})});
});





app.get('/callback',function(request,response){

    if (request.query.code) {
        oa.getOAuthAccessToken(request.query.code, {
            grant_type: 'authorization_code',
            redirect_uri:"http://localhost:3000/callback"
        }, function (err, access_token, refresh_token, res) {
            if (err) {
                response.end('error: ' + JSON.stringify(err));
            }
            else {
                //lookup settings from database
                console.log('--writing access token to database--');
                console.log(access_token)
                var accessTokenExpiration = new Date().getTime() + (3500 * 1000);
                //update access token in database
                data.google_access_token = access_token;
                data.google_access_token_expiration = accessTokenExpiration;

                //set google refresh token if it is returned
                if (refresh_token != undefined) data.google_refresh_token = refresh_token;
                database.collection('data').remove({});
                database.collection('data').insertOne(data);


                var getGoogleEvents = function(accessToken)
                {
                    //instantiate google calendar instance
                    var google_calendar = new gcal.GoogleCalendar(accessToken);

                    google_calendar.events.list('primary', function(err, eventList){
                        if(err){
                            response.write(err.toString());
                        }
                        else{
                            database.collection('events').remove({});
                            database.collection('events').insertOne(eventList);
                            response.redirect('/events');
                        }
                    });
                };

                //retrieve current access token
                var accessToken;

                //check if access token is still valid
                var today = new Date();
                var currentTime = today.getTime();
                if(currentTime < data.google_access_token_expiration)
                {
                    //use the current access token
                    accessToken = data.google_access_token;
                }
                else
                {
                    //refresh the access token
                    oa = new oauth.OAuth2(clientId,
                        clientSecret,
                        "https://accounts.google.com/o",
                        "/oauth2/auth",
                        "/oauth2/token");

                    if(refreshToken)
                    {
                        oa.getOAuthAccessToken(refreshToken, {grant_type:'refresh_token', client_id: clientId, client_secret: clientSecret}, function(err, access_token, refresh_token, res){

                            //lookup settings from database
                            database.collection('data').findOne( function () {
                                console.log('--writing access token to database--');
                                var accessTokenExpiration = new Date().getTime() + (3500 * 1000);

                                //update access token in database
                                data.google_access_token = access_token;
                                data.google_access_token_expiration = accessTokenExpiration;

                                //set google refresh token if it is returned
                                if (refresh_token != undefined) data.google_refresh_token = refresh_token;

                                database.collection('settings').updateMany(data);

                                console.log('-- access token updated:', access_token);
                                response.redirect('http://localhost:3000/events');

                            });
                        });
                    }
                    else
                    {
                        console.log('Application needs authorization.');
                    }


                }
                getGoogleEvents(accessToken);

            }

        });

    }

});








var port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log("Listening on " + port);
});