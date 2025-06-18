require('dotenv').config();
const express = require("express");
const cors = require("cors");
require('https').globalAgent.options.ca = require('ssl-root-cas').create();

// Network proxy
const { setGlobalDispatcher, ProxyAgent } = require("undici");
if (process.env.https_proxy) {
  // Corporate proxy uses CA not in undici's certificate store
  //process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const dispatcher = new ProxyAgent({uri: new URL(process.env.https_proxy).toString() });
  setGlobalDispatcher(dispatcher);
}


const PORT = process.env.PORT || 3000;
const apiKey = `${process.env.GOOGLE_MAPS_API_KEY}`;
const searchRadius = 200;

let OSMenable = true;

const app = express();
app.use(express.json());
app.use(cors());


var stringSimilarity = require("string-similarity");

const amenities = ["bar", "bbq", "biergarten", "cafe", "fast_food", "food_court", "ice_cream", "pub", "restaurant", "college", "driving_school", 
  "kindergarten", "language_school", "library", "music_school", "school", "university", "bicycle_parking", "bicycle_repair_station", 
  "bicycle_rental", "boat_rental", "boat_sharing", "bus_station", "car_rental", "car_sharing", "car_wash", "charging_station", "ferry_terminal", 
  "fuel", "parking", "taxi", "motorcycle_parking", "bank", "atm", "bureau_de_change", "baby_hatch", "clinic", "dentist", "doctors", "hospital", 
  "nursing_home", "pharmacy", "veterinary", "arts_centre", "casino", "cinema", "community_centre", "conference_centre", "events_venue", "nightclub", 
  "planetarium", "social_centre", "stripclub", "studio", "theatre", "animal_boarding", "animal_shelter", "bench", "clock", "drinking_water", "fountain",
   "hunting_stand", "marketplace", "place_of_worship", "playground", "public_bath", "shelter", "shower", "toilets", "townhall", "courthouse", 
   "embassy", "fire_station", "police", "post_box", "post_office", "prison", "ranger_station", "recycling", "waste_basket", "waste_disposal", 
   "water_point", "watering_place", "crematorium", "funeral_hall", "grave_yard", "gym", "sports_centre", "stadium", "swimming_pool", "golf_course", 
   "fitness_centre"]

//checks if the query is similar to an amenity
function checkAmenity(keyword){
  let newKeywords = [];
  keyword = keyword.toLowerCase();
  keyword = keyword.replace(" ", "_");
  amenities.forEach((amenity) => {
      if(amenity.includes(keyword)){
          newKeywords[newKeywords.length] = amenity;
      }
      else if(keyword.includes(amenity)){
        newKeywords[newKeywords.length] = amenity;
      }
  });

  return newKeywords;
}

function getLngLength(latitude) {
  let a = 6378137.0;
  let latradians = latitude * Math.PI / 180;
  let lnglength = Math.PI / 180 * a * Math.cos(latradians);
  return lnglength;
}

function getLatLength(latitude) {
  let latradians = latitude * Math.PI / 180;
  let latlength = 111132.954 - 559.822 * Math.cos(2 * latradians) + 1.175 * Math.cos(4 * latradians);
  return latlength;
}

//Checks is a found place is within a certain radius of your location. It takes into account your position on the globe
//This is needed because the built in radius function does not work properly. We filter out the unwanted results
function withinRadius(positionLat, positionLng, placeLat, placeLng, radius) {
  let latLength = getLatLength(positionLat);
  let lngLength = getLngLength(positionLat);

  let latDistance = (positionLat - placeLat) * latLength;
  let lngDistance = (positionLng - placeLng) * lngLength;

  let distanceFromPlace = Math.sqrt(Math.pow(latDistance, 2) + Math.pow(lngDistance, 2));
  if (distanceFromPlace <= radius) {
    return true;
  }
  else {
    return false;
  }
}

function getAddressDetails(address){
  let parts = address.split(",").map(part => part.trim());

  const placeCity = parts[0];
  const placeAddress = parts[1];
  let placePostalCode = undefined;
  let placeCountry = undefined;

  if(parts.length > 2){
    placePostalCode = parts[2].split(" ")[0];
    placeCountry = parts[2].split(" ").slice(1).join(" ");
  }

    return {
        city: placeCity,         
        address: placeAddress,                 
        postalCode: placePostalCode,
        country: placeCountry
    };
}

function createPOI(placeLat, placeLng, placeName, address, city, country, postalCode, placeCategory) {


  //if we do not get the category of the place the default category will be set as landmark
  if(placeCategory == undefined){
    placeCategory = "landmark";
  }

  const poi = {
      type: "Feature",
      content: {
        type: "POI"
      },
      geometry:{
      coordinates: [
        placeLat,
        placeLng
      ]
    },
    featureID: Math.floor(Math.random()*100000000),
    name:{
      name: placeName
    },

    haspayload: {
      usesSchema: [
        {
          href: "https://genpoijson.org/schema/interchangepoi.json",
          rel: "describedby"
        }
      ],
      address:{
        deliveryPoint: address,
        city: city,
        postalCode: postalCode,
        country: country
      }
    },

    category: {
      category: placeCategory,
      categoryFormat: "ogcindoor"
    }
  }

  return poi;
}

//checks if either one of the strings is substring of the other
function isSubstring(string1, string2){
  if(string2.includes(string1)){
    return true;
  }
  else if(string1.includes(string2)){
    return true;
  }
  return false;
}

//checks if the array already consists a poi with the given name
function containsWithName(poiArray, name, lat, lng){
  if(poiArray.length === 0){
    return false;
  }
  for(let i = 0; i < poiArray.length; i++){
    if(isSubstring(poiArray[i].name.name,name) || 
    (stringSimilarity.compareTwoStrings(poiArray[i].name.name,name) >= 0.6 && 
    withinRadius(lat,lng,poiArray[i].geometry.coordinates[0],poiArray[i].geometry.coordinates[1],7))){
      return true;
    }
  }
  return false;
}

//checks if there is a poi with more information with the same name, if there is, it return that poi
function moreDataWithThisName(poiArray, datacount, name, lat, lng){
  betterPoi = undefined;
  let maxDatacount = datacount;

  for(let i = 0; i < poiArray.length; i++){
    if(isSubstring(poiArray[i].name.name,name) || 
    (stringSimilarity.compareTwoStrings(poiArray[i].name.name,name) >= 0.6 && 
    withinRadius(lat,lng,poiArray[i].geometry.coordinates[0],poiArray[i].geometry.coordinates[1],7))){
      let newPoiDatacount = 0;
      if(poiArray[i].haspayload.address.deliveryPoint != undefined){
        newPoiDatacount++;
      }
      if(poiArray[i].haspayload.address.postalCode != undefined){
        newPoiDatacount++;
      }
      if(poiArray[i].haspayload.address.city != undefined){
        newPoiDatacount++;
      }
      if(poiArray[i].haspayload.address.country != undefined){
        newPoiDatacount++;
      }
      if(newPoiDatacount > maxDatacount){
        maxDatacount = newPoiDatacount;
        betterPoi = poiArray[i];
      }
    }
  }
  return betterPoi;
}

//we remove the duplicate finds using the names of the pois
function removeDuplicatesbyName(poiArray){
  if(poiArray.length === 0){
    return poiArray;
  }
    let newPoiArray = [];

    poiArray.forEach(poi => {
      if(poi.name.name != undefined){
        if(!containsWithName(newPoiArray, poi.name.name, poi.geometry.coordinates[0], poi.geometry.coordinates[1])){
          newPoiArray.push(poi);
        }
      }
    });

    for(let i = 0; i < newPoiArray.length; i++){
      if(newPoiArray[i].name.name != undefined){
        datacount = 0;
        if(newPoiArray[i].haspayload.address.deliveryPoint != undefined){
          datacount++;
        }
        if(newPoiArray[i].haspayload.address.postalCode != undefined){
          datacount++;
        }
        if(newPoiArray[i].haspayload.address.city != undefined){
          datacount++;
        }
        if(newPoiArray[i].haspayload.address.country != undefined){
          datacount++;
        }
        newPoi = moreDataWithThisName(poiArray, datacount, newPoiArray[i].name.name, newPoiArray[i].geometry.coordinates[0],newPoiArray[i].geometry.coordinates[1]);
        if(newPoi != undefined){
          newPoiArray[i] = newPoi;
        }
      }
      }
    return newPoiArray;
}

app.get("/locations", async (req, res) => {
  try {
    const myLat = parseFloat(req.query.lat);
    const myLng = parseFloat(req.query.lng);
    const textQuery = req.query.textQuery;

    let apiURLtextSearch = `https://maps.googleapis.com/maps/api/place/textsearch/json?location=${myLat},${myLng}&query=${textQuery}&radius=${searchRadius}&key=${apiKey}`;
    
    let pois = [];

    const textSearchResponse = await fetch(apiURLtextSearch);
    const textSearchData = await textSearchResponse.json();

    const textSearchPlaces = textSearchData.results;

    await textSearchPlaces.forEach(place => {
      let placeLat = place.geometry.location.lat;
      let placeLng = place.geometry.location.lng;
      if (withinRadius(myLat, myLng, placeLat, placeLng, searchRadius)) {
        let addressDetails = getAddressDetails(place.formatted_address);
        let poi = createPOI(placeLat, placeLng, place.name, addressDetails.address, addressDetails.city,addressDetails.country, addressDetails.postalCode, place.types[0]);
        if(poi.name.name != undefined){
          pois.push(poi);
        }
      }
    });

    let apiURLnearbySearch = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?keyword=${textQuery}&location=${myLat}%2C${myLng}&&radius=${searchRadius}&key=${apiKey}`;
    
    const nearbySearchResponse = await fetch(apiURLnearbySearch);
    const nearbySearchData = await nearbySearchResponse.json();

    const nearbySearchPlaces = nearbySearchData.results;

    await nearbySearchPlaces.forEach(place =>{
      let placeLat = place.geometry.location.lat;
      let placeLng = place.geometry.location.lng;
      if (withinRadius(myLat, myLng, placeLat, placeLng, searchRadius)){
        let addressDetails = getAddressDetails(place.vicinity);
        //The country address always comes as a string in the following format: City, Address, Postal-Code Country, This is only true for google
        let poi = createPOI(placeLat, placeLng, place.name, addressDetails.address, addressDetails.city,addressDetails.country, addressDetails.postalCode , place.types[0]);
        if(poi.name.name != undefined){
          pois.push(poi);
        }
      }
    });

    const apiURLOpenStreetMap = "https://overpass-api.de/api/interpreter";
    let word = checkAmenity(textQuery);
    let amenities = "";
    let query = ''
    if (word.length == 0){
      query = `
      [out:json];
      node
      ["amenity"]
      ["name"~"${textQuery}", i]
      (around:${searchRadius}, ${myLat}, ${myLng});
      out;
      `;
    }
    else{
      if(word.length > 1){
        for(let i = 0; i < word.length; i++){
          amenities = amenities + word[i];
          if(i < word.length - 1){
            amenities = amenities + '|';
          }
        }
        word = amenities;
        word = '~"' + word;
      }
      else{
        word = '="' + word;
      }
      query = `
      [out:json];
      node
      ["amenity"${word}"]
      (around:${searchRadius}, ${myLat}, ${myLng});
      out;
      `;
    }
    if(OSMenable){
      OSMenable = false;
      console.log("OSM disabled");
      await fetch(apiURLOpenStreetMap, { method: "POST", body: query })
        .then(response => response.json())
        .then(data => {
          setTimeout(() => {
            OSMenable = true;
            console.log("OSM enabled again")
          },1200);
          data.elements.forEach(place => {
            let lat = place.lat;
            let lon = place.lon;
            let city = place.tags["addr:city"];
            let postCode = place.tags["addr:postcode"];
            let street = place.tags["addr:street"];
            let houseNumber = place.tags["addr:housenumber"];
            let deliveryPoint;
            if(street === undefined || houseNumber === undefined){
                deliveryPoint = undefined;
            }
            else{
                deliveryPoint = street + ' ' + houseNumber;
            }
            let name = place.tags.name;
            let country = place.tags["addr:country"];
            let category = place.amenity;
            let poi = createPOI(lat,lon,name,deliveryPoint,city,country, postCode, category);
            if(poi.name.name != undefined){
              pois.push(poi);
            }
          });
        })
        .catch(error => {console.error("Error fetching Overpass data:", error);
            setTimeout(() => {
                OSMenable = true;
                console.log("OSM enabled again");
              }, 1200);
        });
      }

   const newPois = removeDuplicatesbyName(pois);

    const POICollection = {
      type: "FeatureCollection",
      features: newPois
    };
    res.json(POICollection);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`API is running at http://localhost:${PORT}`);
});
