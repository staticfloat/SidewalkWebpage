package models.daos.slickdaos

import com.mohiva.play.silhouette.api.LoginInfo
import com.mohiva.play.silhouette.api.util.PasswordInfo
import com.mohiva.play.silhouette.impl.daos.DelegableAuthInfoDAO
import play.api.db.slick._
import scala.concurrent.Future
import models.daos.slickdaos.DBTableDefinitions._
import models.utils.MyPostgresDriver.api._


/**
 * The DAO to store the password information.
 */
class PasswordInfoDAOSlick extends DelegableAuthInfoDAO[PasswordInfo] {

  import play.api.Play.current

  /**
   * Saves the password info.
   *
   * @param loginInfo The login info for which the auth info should be saved.
   * @param authInfo The password info to save.
   * @return The saved password info or None if the password info couldn't be saved.
   */
  def save(loginInfo: LoginInfo, authInfo: PasswordInfo): Future[PasswordInfo] = {
    /*
    data += (loginInfo -> authInfo)
    Future.successful(authInfo)
    */
    Future.successful {
      DB withSession {implicit session =>
        val infoId = slickLoginInfos.filter(
          x => x.providerID === loginInfo.providerID && x.providerKey === loginInfo.providerKey
        ).head.id.get
        slickPasswordInfos insert DBPasswordInfo(authInfo.hasher, authInfo.password, authInfo.salt, infoId)
        authInfo
      }
    }
  }

  /**
   * Finds the password info which is linked with the specified login info.
   *
   * @param loginInfo The linked login info.
   * @return The retrieved password info or None if no password info could be retrieved for the given login info.
   */
  def find(loginInfo: LoginInfo): Future[Option[PasswordInfo]] = {
    Future.successful {
      DB withSession { implicit session =>
        slickLoginInfos.filter(info => info.providerID === loginInfo.providerID && info.providerKey === loginInfo.providerKey).headOption match {
          case Some(info) =>
            val passwordInfo = slickPasswordInfos.filter(_.loginInfoId === info.id).head
            Some(PasswordInfo(passwordInfo.hasher, passwordInfo.password, passwordInfo.salt))
          case None => None
        }
      }
    }
  }
}