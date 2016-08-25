/**
 * Task module.
 * @param geojson
 * @param currentLat
 * @param currentLng
 * @returns {{className: string}}
 * @constructor
 * @memberof svl
 */
function Task (geojson, currentLat, currentLng) {
    var self = this;
    var _geojson;
    var _furthestPoint;

    var taskCompletionRate = 0,
        paths,
        status = {
            isCompleted: false
        },
        properties = {
            auditTaskId: null,
            streetEdgeId: null
        };

    /**
     * This method takes a task parameters and set up the current task.
     * @param geojson Description of the next task in json format.
     * @param currentLat Current latitude
     * @param currentLng Current longitude
     */
    function _init (geojson, currentLat, currentLng) {
        var len = geojson.features[0].geometry.coordinates.length - 1,
            lat1 = geojson.features[0].geometry.coordinates[0][1],
            lng1 = geojson.features[0].geometry.coordinates[0][0],
            lat2 = geojson.features[0].geometry.coordinates[len][1],
            lng2 = geojson.features[0].geometry.coordinates[len][0];
        _geojson = geojson;

        self.setProperty("streetEdgeId", _geojson.features[0].properties.street_edge_id);

        if (_geojson.features[0].properties.completed) {
            self.complete();
        }

        if (currentLat && currentLng) {
            // Continuing from the previous task (i.e., currentLat and currentLng exist).
            var d1 = util.math.haversine(lat1, lng1, currentLat, currentLng),
                d2 = util.math.haversine(lat2, lng2, currentLat, currentLng);

            if (d2 < d1) self.reverseCoordinates();
        }

        var lat = _geojson.features[0].geometry.coordinates[0][1];
        var lng = _geojson.features[0].geometry.coordinates[0][0];

        _furthestPoint = turf.point([lng, lat]);

        paths = null;
    }

    /**
     * Get the index of the segment in the street edge that is closest to the point
     * @param point A geojson Point feature
     * @param line A geojson LineString Feature
     */
    this._indexOfTheClosestSegment = function (point, line) {
        var coords = line.geometry.coordinates,
            lenCoord = coords.length,
            segment, lengthArray = [], minValue;

        for (var i = 0; i < lenCoord - 1; i++) {
            segment = turf.linestring([ [coords[i][0], coords[i][1]], [coords[i + 1][0], coords[i + 1][1]] ]);
            lengthArray.push(_pointSegmentDistance(point, segment));
        }
        minValue = Math.min.apply(null, lengthArray);
        return lengthArray.indexOf(minValue);
    };

    /**
     * This method creates Google Maps Polyline objects to render on the google maps.
     * @param lat
     * @param lng
     * @returns {Array|*[]}
     * @private
     */
    function _completedTaskPaths (lat, lng) {
        var newPaths,
            line = _geojson.features[0],
            currentPoint = turf.point([lng, lat]),
            snapped = turf.pointOnLine(line, currentPoint),
            closestSegmentIndex = this._indexOfTheClosestSegment(currentPoint, line),
            coords = line.geometry.coordinates,
            segment,
            completedPath = [new google.maps.LatLng(coords[0][1], coords[0][0])],
            incompletePath = [];

        for (var i = 0; i < closestSegmentIndex; i++) {
            segment = turf.linestring([ [coords[i][0], coords[i][1]], [coords[i + 1][0], coords[i + 1][1]] ]);
            completedPath.push(new google.maps.LatLng(coords[i + 1][1], coords[i + 1][0]));
        }

        completedPath.push(new google.maps.LatLng(snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]));
        incompletePath.push(new google.maps.LatLng(snapped.geometry.coordinates[1], snapped.geometry.coordinates[0]));
        for (var i = closestSegmentIndex; i < coords.length - 1; i++) {
            incompletePath.push(new google.maps.LatLng(coords[i + 1][1], coords[i + 1][0]))
        }
        // Create paths
        newPaths = [
            new google.maps.Polyline({
                path: completedPath,
                geodesic: true,
                strokeColor: '#00ff00',
                strokeOpacity: 1.0,
                strokeWeight: 2
            }),
            new google.maps.Polyline({
                path: incompletePath,
                geodesic: true,
                strokeColor: '#ff0000',
                strokeOpacity: 1.0,
                strokeWeight: 2
            })
        ];
        return newPaths;
    }

    /**
     * References:
     * http://turfjs.org/static/docs/module-turf_point-on-line.html
     * http://turfjs.org/static/docs/module-turf_distance.html
     */
    function _getTaskCompletionRate (lat, lng) {
        var totalStreetEdgeLength = turf.lineDistance(_geojson.features[0]);
        var auditedStreetEdgeSegments = this._getAuditedSegments(lat, lng);
        var cumulativeDistance = 0;
        for (var i = 0, len = auditedStreetEdgeSegments.length; i < len; i++) {
            cumulativeDistance += turf.lineDistance(auditedStreetEdgeSegments[i]);
        }

        var cumulativeRate = cumulativeDistance / totalStreetEdgeLength;

        return taskCompletionRate < cumulativeRate ? cumulativeRate : taskCompletionRate;
    }

    this._coordinatesToSegments = function (coordinates) {
        var returnSegments = [];
        for (var i = 1, len = coordinates.length; i < len; i++) {
            returnSegments.push(turf.linestring([
                [coordinates[i - 1][0], coordinates[i - 1][1]],
                [coordinates[i][0], coordinates[i][1]]
            ]));
        }
        return returnSegments;
    };

    this._getPointsOnAuditedSegments = function (currentLat, currentLng) {
        var streetEdge =  _geojson.features[0];
        var currentPosition = turf.point([currentLng, currentLat]);
        // var snappedPosition = turf.pointOnLine(streetEdge, currentPosition);
        var snappedPosition = this._snapAFurthestPointOnALine(streetEdge, currentPosition);
        var closestSegmentIndex = self._indexOfTheClosestSegment(currentPosition, streetEdge);
        var coordinates = [];

        for (var i = 0; i <= closestSegmentIndex; i++) {
            coordinates.push(streetEdge.geometry.coordinates[i]);
        }

        coordinates.push(snappedPosition.geometry.coordinates);

        return coordinates;
    };

    this._getPointsOnUnauditedSegments = function (currentLat, currentLng) {
        var streetEdge =  _geojson.features[0];
        var currentPosition = turf.point([currentLng, currentLat]);
        //var snappedPosition = turf.pointOnLine(streetEdge, currentPosition);
        var snappedPosition = this._snapAFurthestPointOnALine(streetEdge, currentPosition);
        var closestSegmentIndex = self._indexOfTheClosestSegment(currentPosition, streetEdge);
        var coordinates = [];

        coordinates.push(snappedPosition.geometry.coordinates);
        for (var i = closestSegmentIndex + 1, len = streetEdge.geometry.coordinates.length; i < len; i++) {
            coordinates.push(streetEdge.geometry.coordinates[i]);
        }

        return coordinates;
    };

    this._getAuditedSegments = function (lat, lng) {
        var coordinates = this._getPointsOnAuditedSegments(lat, lng);
        if (coordinates.length > 1) {
            return this._coordinatesToSegments(coordinates);
        } else {
            console.error("`Task._getPointsOnAuditedSegments` returned only 1 coordinate");
            return [];
        }
    };

    this._getUnauditedSegments = function (lat, lng) {
        var coordinates = this._getPointsOnUnauditedSegments(lat, lng);
        if (coordinates.length > 1) {
            return this._coordinatesToSegments(coordinates);
        } else {
            console.error("`Task._getPointsOnUnauditedSegments` returned only 1 coordinate");
            return [];
        }
    };

    /**
     * Get a distance between a point and a segment
     * @param point A Geojson Point feature
     * @param segment A Geojson LineString feature with two points
     * @returns {*}
     */
    function _pointSegmentDistance(point, segment) {
        var snapped = turf.pointOnLine(segment, point),
            snappedLat = snapped.geometry.coordinates[1],
            snappedLng = snapped.geometry.coordinates[0],
            coords = segment.geometry.coordinates;
        if (Math.min(coords[0][0], coords[1][0]) <= snappedLng &&
            snappedLng <= Math.max(coords[0][0], coords[1][0]) &&
            Math.min(coords[0][1], coords[1][1]) <= snappedLat &&
            snappedLng <= Math.max(coords[0][1], coords[1][1])) {
            return turf.distance(point, snapped);
        } else {
            var point1 = turf.point([coords[0][0], coords[0][1]]);
            var point2 = turf.point([coords[1][0], coords[1][1]]);
            return Math.min(turf.distance(point, point1), turf.distance(point, point2));
        }
    }

    this._snapAFurthestPointOnALine = function (line, point, threshold, unit) {
        if (!unit) unit = "kilometers";
        if (!threshold) threshold = 0.025;
        var snapped = turf.pointOnLine(line, point);
        var distance = turf.distance(snapped, point, unit);
        return distance < threshold ? snapped : _furthestPoint;
    };

    /**
     * Set the isCompleted status to true and change the color of the street into green.
     * @returns {complete}
     */
    this.complete = function () {
        status.isCompleted = true;
        return this;
    };

    this.getAuditTaskId = function () {
        return properties.auditTaskId;
    };

    /**
     * Get a geojson feature
     * @returns {null}
     */
    this.getFeature = function () {
        return _geojson ? _geojson.features[0] : null;
    };

    /**
     * Get geojson
     * @returns {*}
     */
    this.getGeoJSON = function () {
        return _geojson; 
    };

    /**
     * Get geometry
     */
    this.getGeometry = function () {
        return _geojson ? _geojson.features[0].geometry : null;
    };

    /**
     * Get the last coordinate in the geojson.
     * @returns {{lat: *, lng: *}}
     */
    this.getLastCoordinate = function () {
        var len = geojson.features[0].geometry.coordinates.length - 1,
            lat = _geojson.features[0].geometry.coordinates[len][1],
            lng = _geojson.features[0].geometry.coordinates[len][0];
        return { lat: lat, lng: lng };
    };

    /**
     * Return the property
     * @param key Field name
     * @returns {null}
     */
    this.getProperty = function (key) {
        return key in properties ? properties[key] : null;
    };

    /**
     * Get the first coordinate in the geojson
     * @returns {{lat: *, lng: *}}
     */
    this.getStartCoordinate = function () {
        var lat = _geojson.features[0].geometry.coordinates[0][1],
            lng = _geojson.features[0].geometry.coordinates[0][0];
        return { lat: lat, lng: lng };
    };

    /**
     * Returns the street edge id of the current task.
     */
    this.getStreetEdgeId = function () {
        return _geojson.features[0].properties.street_edge_id;
    };

    /**
     * Returns the task start time
     */
    this.getTaskStart = function () {
        return _geojson.features[0].properties.task_start;
    };

    /**
     * Get the cumulative distance
     * Reference:
     * turf-line-distance: https://github.com/turf-junkyard/turf-line-distance
     *
     * @params {units} String can be degrees, radians, miles, or kilometers
     * @returns {number} distance in meters
     */
    this.getDistanceWalked = function (currentLat, currentLng, unit) {
        if (!unit) unit = "kilometers";
        var distance = 0;
        var walkedSegments = this._getAuditedSegments(currentLat, currentLng);

        for (var i = 0, len = walkedSegments.length; i < len; i++) {
            distance += turf.lineDistance(walkedSegments[i], unit);
        }
        return distance;
    };


    /**
     * This method checks if the task is completed by comparing the
     * current position and the ending point.
     * 
     * @param lat
     * @param lng
     * @param threshold
     * @returns {boolean}
     */
    this.isAtEnd = function (lat, lng, threshold) {
        if (_geojson) {
            var d, len = _geojson.features[0].geometry.coordinates.length - 1,
                latEnd = _geojson.features[0].geometry.coordinates[len][1],
                lngEnd = _geojson.features[0].geometry.coordinates[len][0];

            if (!threshold) threshold = 10; // 10 meters
            d = util.math.haversine(lat, lng, latEnd, lngEnd);
            return d < threshold;
        }
    };

    /**
     * Returns if the task is completed or not
     * @returns {boolean}
     */
    this.isCompleted = function () {
        return status.isCompleted;
    };

    /**
     * Checks if the current task is connected to the given task
     * @param task
     * @param threshold
     * @param unit
     * @returns {boolean}
     */
    this.isConnectedTo = function (task, threshold, unit) {
        if (!threshold) threshold = 0.01;
        if (!unit) unit = "kilometers";

        var lastCoordinate = self.getLastCoordinate(),
            targetCoordinate1 = task.getStartCoordinate(),
            targetCoordinate2 = task.getLastCoordinate(),
            p = turf.point([lastCoordinate.lng, lastCoordinate.lat]),
            p1 = turf.point([targetCoordinate1.lng, targetCoordinate1.lat]),
            p2 = turf.point([targetCoordinate2.lng, targetCoordinate2.lat]);
        return turf.distance(p, p1, unit) < threshold || turf.distance(p, p2, unit) < threshold;
    };

    this.isConnectedToAPoint = function (point, threshold, unit) {
        if (!threshold) threshold = 0.01;
        if (!unit) unit = "kilometers";

        var startCoordinate = self.getStartCoordinate(),
            lastCoordinate = self.getLastCoordinate(),
            p2 = turf.point([lastCoordinate.lng, lastCoordinate.lat]),
            p1 = turf.point([startCoordinate.lng, startCoordinate.lat]);
        return turf.distance(point, p1, unit) < threshold || turf.distance(point, p2, unit) < threshold;
    };

    /**
     * Get the line distance of the task street edge
     * @param unit
     * @returns {*}
     */
    this.lineDistance = function (unit) {
        if (!unit) unit = "kilometers";
        return turf.lineDistance(_geojson.features[0], unit);
    };

    /**
     * Todo. This should go to the MapService or its submodule.
     */
    this.eraseFromGoogleMaps = function () {
        if ('map' in svl && google && paths) {
            for (var i = 0; i < paths.length; i++) {
                paths[i].setMap(null);
            }
        }
    };

    this.getTaskCompletionRate = function (){
        return taskCompletionRate ? taskCompletionRate : 0;
    };

    /**
     * Render the task path on the Google Maps pane.
     * Todo. This should go to the MapService or its submodule
     * Reference:
     * https://developers.google.com/maps/documentation/javascript/shapes#polyline_add
     * https://developers.google.com/maps/documentation/javascript/examples/polyline-remove
     */
    this.render = function () {
        if ('map' in svl && google) {
            self.eraseFromGoogleMaps();
            if (this.isCompleted()) {
                // If the task has been completed already, set the paths to a green polyline
                var gCoordinates = _geojson.features[0].geometry.coordinates.map(function (coord) {
                    return new google.maps.LatLng(coord[1], coord[0]);
                });
                paths = [
                    new google.maps.Polyline({
                        path: gCoordinates,
                        geodesic: true,
                        strokeColor: '#00ff00',
                        strokeOpacity: 1.0,
                        strokeWeight: 2
                    })
                ];
            } else if (paths) {
                var latlng = svl.map.getPosition();
                var newTaskCompletionRate = _getTaskCompletionRate(latlng.lat, latlng.lng);

                if (taskCompletionRate < newTaskCompletionRate) {
                    taskCompletionRate = newTaskCompletionRate;
                    paths = _completedTaskPaths(latlng.lat, latlng.lng);
                }
            } else {
                // If this is a new task and the this Task instance's `paths` is not set yet, create a red GMaps Polyline.
                var gCoordinates = _geojson.features[0].geometry.coordinates.map(function (coord) {
                    return new google.maps.LatLng(coord[1], coord[0]);
                });
                paths = [
                    new google.maps.Polyline({
                        path: gCoordinates,
                        geodesic: true,
                        strokeColor: '#ff0000',
                        strokeOpacity: 1.0,
                        strokeWeight: 2
                    })
                ];
            }

            for (var i = 0, len = paths.length; i < len; i++) {
                paths[i].setMap(svl.map.getMap());
            }
        }
    };

    /**
     * Flip the coordinates of the line string if the last point is closer to the end point of the current street segment.
     */
    this.reverseCoordinates = function (){
        _geojson.features[0].geometry.coordinates.reverse();
    };

    this.setProperty = function (key, value){
        properties[key] = value;
    };

    this.getFurthestPointReached = function () {
        return _furthestPoint;
    };

    this.updateTheFurthestPointReached = function (currentLat, currentLng) {
        var latFurthest = _furthestPoint.geometry.coordinates[1];
        var lngFurthest = _furthestPoint.geometry.coordinates[0];
        var distanceAtTheFurthestPoint = this.getDistanceWalked(latFurthest, lngFurthest);
        var distanceAtCurrentPoint = this.getDistanceWalked(currentLat, currentLng);

        if (distanceAtCurrentPoint > distanceAtTheFurthestPoint) {
            _furthestPoint = turf.point([currentLng, currentLat]);
        }
    };

    _init(geojson, currentLat, currentLng);
}