package models.street

import models.utils.MyPostgresDriver.simple._

import play.api.Play.current

import scala.slick.lifted.ForeignKeyQuery
import scala.slick.jdbc.{StaticQuery => Q}

import scala.math.exp

case class StreetEdgePriorityParameter(regionId: Int, streetEdgeId: Int, priorityParameter: Double)
case class StreetEdgePriority(streetEdgePriorityId: Int, regionId: Int, streetEdgeId: Int, priority: Double)

class StreetEdgePriorityTable(tag: Tag) extends Table[StreetEdgePriority](tag, Some("sidewalk"),  "street_edge_priority") {
  def streetEdgePriorityId = column[Int]("street_edge_priority_id", O.NotNull, O.PrimaryKey, O.AutoInc)
  def regionId = column[Int]("region_id",O.NotNull)
  def streetEdgeId = column[Int]("street_edge_id", O.NotNull)
  def priority = column[Double]("priority", O.NotNull)

  def * = (streetEdgePriorityId, regionId, streetEdgeId, priority) <> ((StreetEdgePriority.apply _).tupled, StreetEdgePriority.unapply)

  def streetEdge: ForeignKeyQuery[StreetEdgeTable, StreetEdge] =
    foreignKey("street_edge_priority_street_edge_id_fkey", streetEdgeId, TableQuery[StreetEdgeTable])(_.streetEdgeId)
}

object StreetEdgePriorityTable {
  val db = play.api.db.slick.DB
  val streetEdgePriorities = TableQuery[StreetEdgePriorityTable]

  /**
    * Save a record.
    * @param streetEdgeId
    * @param regionId
    * @return
    */
  def save(streetEdgePriority: StreetEdgePriority): Int = db.withTransaction { implicit session =>
    val streetEdgePriorityId: Int =
      (streetEdgePriorities returning streetEdgePriorities.map(_.streetEdgePriorityId)) += streetEdgePriority
    streetEdgePriorityId
  }

  /**
    * Update the priority attribute of a single streetEdge.
    * @param streetEdgeId
    * @param priority
    * @return
    */

  def updateSingleStreetEdge(regionId: Int, streetEdgeId: Int, priority: Double) = db.withTransaction { implicit session =>
    val q = for { edg <- streetEdgePriorities if edg.streetEdgeId === streetEdgeId && edg.regionId === regionId} yield edg.priority
    q.update(priority)
  }

  /**
    * Helper logistic function to convert a double float to a number between 0 and 1.
    * @param z
    * @return
    */

  def logisticFunction(x: List[Double]): List[Double] = db.withTransaction { implicit session =>
    //val z: Double = w.zip(x).map { case (w_i, x_i) => w_i * x_i }.sum
    return x.map{ z => exp(-z)/(1+exp(-z))}
  }

  /**
    * Recalculate the priority attribute for all streetEdges.
    * @param rankParameterGeneratorList list of functions that will generate a number for each streetEdge
    * @param weightVector that will be used to weight the generated parameters
    * @param paramScalingFunction that will be used to convert the weighted sum of numbers for each street into a number between 0 and 1
    * @return
    */
  def updateAllStreetEdgePriorities(rankParameterGeneratorList: List[()=>List[StreetEdgePriorityParameter]], weightVector: List[Double], paramScalingFunction: (List[Double])=>List[Double]): List[Double] = db.withTransaction { implicit session =>
    // Ideally we would apply the functions one at a time for each street edge
    // and then have a running sum or product for the priority calculation

    // This is a temporary implementation.
    // We need to do an inner join with (region_id, street_edge_id) on the intermediate table generated by each function
    // in rankParameterGeneratorList. Instead we are assuming each function will give the list of parameters in the same order

    var weightedSum: List[Double] = None
    rankParameterGeneratorList.zip(weightVector).foreach{ (f_i,w_i) =>
      var priorityParamTable: List[StreetEdgePriorityParameter] = f_i()
      weightedSum match {
        case None =>
          weightedSum = priorityParamTable.map{_.priorityParam * w_i}
        case _ =>
          var tempParam: List[Double] = priorityParamTable.map{_.priorityParam * w_i}
          weightedSum = weightedSum.zip(tempParam).map { case (x_i, y_i) => x_i + y_i }
      }

    }
    return paramScalingFunction(weightedSum)
  }

  def listAll: List[StreetEdgePriority] = db.withTransaction { implicit session =>
    streetEdgePriorities.list
  }

  /**
    * Functions that generate paramaters for street edge priority evaluation
    */

  /**
    * This method returns how many times streets are audited
    * @return
    */
  def selectCompletionCount: List[StreetEdgePriorityParameter] = db.withSession { implicit session =>
    val selectCompletionCountQuery =  Q.queryNA[StreetEdgePriorityParameter](
      """SELECT region.region_id, street_edge.street_edge_id, CAST(street_edge_assignment_count.completion_count as float)
        |  FROM sidewalk.region
        |INNER JOIN sidewalk.street_edge_region
        |  ON street_edge_region.region_id = region.region_id
        |INNER JOIN sidewalk.street_edge
        |  ON street_edge.street_edge_id = street_edge_region.street_edge_id
        |INNER JOIN street_edge_assignment_count
        |  ON street_edge_assignment_count.street_edge_id = street_edge.street_edge_id
        |WHERE region.deleted = FALSE
        |  AND region.region_type_id = 2
        |  AND street_edge.deleted = FALSE""".stripMargin
    )
    selectCompletionCountQuery.list
  }
}