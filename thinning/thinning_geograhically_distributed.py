#!/usr/bin/python
import psycopg2
import numpy as np
import time


def CreateTables(cur):
    for command in create_tables:
        cur.execute(command)

def DropTables(cur):
    for command in drop_tables:
        cur.execute(command)

def getNumber(cur,region,LABEL_TYPE):
    get_number = [
    """
    select l.label_type_id, count(*)
    from sidewalk.label l, sidewalk.problem_severity ps, sidewalk.label_point p, reg_lab rl
    where l.label_id = ps.label_id and ps.label_id = p.label_id and l.label_id = rl.label_id and rl.region_id =%d
    group by l.label_type_id;
    """%(region)
    ]

    for command in get_number:
        cur.execute(command)
        rows = cur.fetchall()
        num = np.zeros(LABEL_TYPE)
        for row in rows:
            num[int(row[0])-1]=int(row[1])
    return num


def getAllPoints(cur, region, LABEL_TYPE):
    get_all_points = []
    for i in range(LABEL_TYPE):
        get_all_points.append(
        """
        select distinct ps.label_id, ps.severity
        from sidewalk.label l, sidewalk.problem_severity ps, sidewalk.label_point p, reg_lab rl
        where l.label_id = ps.label_id and ps.label_id = p.label_id and l.label_type_id = %d
        and l.label_id = rl.label_id and rl.region_id =%d
        order by ps.severity DESC
        """%(i+1,region)
        )

    allPoint = []
    for command in get_all_points:
        cur.execute(command)
        rows = cur.fetchall()
        allPoint.append(np.zeros(len(rows)))
        index = 0
        for row in rows:
            allPoint[-1][index] = np.array(row[0])
            index = index+1
    return allPoint

def calculateZoomLevel(LABEL_TYPE,ZOOM_LEVEL,allPoints,VisNum):
    zoomLevel = []
    for i in range(LABEL_TYPE):
        for j in range(allPoints[i].shape[0]):
            for z in range(ZOOM_LEVEL):
                if j<=VisNum[z,i]:
                    zoomLevel.append([int(allPoints[i][j]),z])
    return zoomLevel

def addZoomLevel(cur,zoomLevel):
    for point in zoomLevel:
        cur.execute("INSERT INTO sidewalk.label_presampled VALUES (%d, %d);"%(point[0],point[1]))

def clean_tables(cur):
    cur.execute(
    """
    truncate table label_presampled;
    """
    )

def query(cur):
    queries = [
    """
    SELECT label.label_id, label.audit_task_id, label.gsv_panorama_id, label_type.label_type, label_point.lat, label_point.lng
      FROM sidewalk.label
    INNER JOIN sidewalk.label_type
      ON label.label_type_id = label_type.label_type_id
    INNER JOIN sidewalk.label_point
      ON label.label_id = label_point.label_id
    INNER JOIN sidewalk.label_presampled
      ON label.label_id = label_presampled.label_id
    WHERE label.deleted = false
      AND label_presampled.zoom_level = 6
      AND label_point.lat IS NOT NULL
      AND ST_Intersects(label_point.geom, ST_MakeEnvelope(-77.5, 38.87, -77, 38.95, 4326))
    """
    ]

def buildIndex(cur):
    cur.execute(
    """
    DROP INDEX IF EXISTS rt;
    CREATE INDEX rt ON sidewalk.label(panorama_lat,panorama_lng);
    """
    )

def dropIndex(cur):
    cur.execute(
    """
    DROP INDEX rt ON sidewalk.label;
    """
    )


def test_Index(cur):
    begin_time = time.time()
    for i in range(100):
        query(cur)
    end_time = time.time()
    print("Query time without index= ", end_time - begin_time)

    buildIndex(cur)

    begin_time = time.time()
    for i in range(100):
        query(cur)
    end_time = time.time()
    print("Query time with index = ", end_time - begin_time)

def create_reg_lab(cur):
    print("Building reg_lab table...")
    queries = [
    """
    DROP TABLE IF EXISTS reg_lab;
    CREATE TABLE reg_lab(label_id int,region_id int);
    insert into reg_lab
    SELECT label.label_id,max(region.region_id)
    FROM sidewalk.street_edge
    INNER JOIN sidewalk.region
    ON ST_Intersects(street_edge.geom, region.geom)
    INNER JOIN sidewalk.audit_task
    ON audit_task.street_edge_id = street_edge.street_edge_id
    INNER JOIN sidewalk.label
    ON label.audit_task_id=audit_task.audit_task_id
    WHERE region.deleted = FALSE AND street_edge.deleted=FALSE
    GROUP BY label.label_id;
    """
    ]
    for query in queries:
        cur.execute(query)


def getRegion(cur):
    print("Getting distinct region ids")
    cur.execute(
    """
    SELECT rl.region_id
    FROM reg_lab rl
    GROUP BY rl.region_id
    ORDER BY rl.region_id
    """
    )
    region = []
    rows = cur.fetchall()
    for row in rows:
        region.append(int(row[0]))
    return region

def main():
	#make connection
    ZOOM_LEVEL = 8
    LABEL_TYPE = 7
    SampDeg = 0.6
    try:
        conn = psycopg2.connect("dbname='sidewalk' user='sidewalk' host='localhost' port='5433' password='sidewalk'")
    except psycopg2.Error:
        print("I am unable to connect to the database")
    cur = conn.cursor()
    clean_tables(cur)
    create_reg_lab(cur)
    regions = getRegion(cur)

    #print(regions)
    for region in regions:
        #print("processing region:", region)
        totalNum = getNumber(cur,region,LABEL_TYPE)
        VisNum = np.zeros((ZOOM_LEVEL,LABEL_TYPE))
        VisNum[ZOOM_LEVEL-1] = totalNum
        for i in range(ZOOM_LEVEL-1):
            VisNum[ZOOM_LEVEL-2-i] = VisNum[ZOOM_LEVEL-1-i]*SampDeg
        VisNum.astype(int)
        allPoints = getAllPoints(cur,region,LABEL_TYPE)
        zoomLevel = calculateZoomLevel(LABEL_TYPE,ZOOM_LEVEL,allPoints,VisNum)
        addZoomLevel(cur,zoomLevel)


    test_Index(cur)
    conn.commit()


if __name__ == "__main__":
	main()