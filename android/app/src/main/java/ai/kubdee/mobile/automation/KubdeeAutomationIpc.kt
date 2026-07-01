package ai.kubdee.mobile.automation

import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

object KubdeeAutomationIpc {
  private const val TAG = "KubdeeAutomationIpc"

  const val ACTION_START_SHOPEE_IMPORT = "ai.kubdee.mobile.automation.START_SHOPEE_IMPORT"
  const val ACTION_START_SHOPEE_POST = "ai.kubdee.mobile.automation.START_SHOPEE_POST"
  const val ACTION_STOP_SHOPEE = "ai.kubdee.mobile.automation.STOP_SHOPEE"

  const val ACTION_EVENT_SHOPEE_IMPORT_LOG = "ai.kubdee.mobile.automation.EVENT_SHOPEE_IMPORT_LOG"
  const val ACTION_EVENT_SHOPEE_IMPORT_PRODUCT = "ai.kubdee.mobile.automation.EVENT_SHOPEE_IMPORT_PRODUCT"
  const val ACTION_EVENT_SHOPEE_IMPORT_FINISHED = "ai.kubdee.mobile.automation.EVENT_SHOPEE_IMPORT_FINISHED"
  const val ACTION_EVENT_SHOPEE_POST_LOG = "ai.kubdee.mobile.automation.EVENT_SHOPEE_POST_LOG"
  const val ACTION_EVENT_SHOPEE_POST_FINISHED = "ai.kubdee.mobile.automation.EVENT_SHOPEE_POST_FINISHED"

  const val EXTRA_PAYLOAD_JSON = "payloadJson"
  const val EXTRA_RUN_ID = "runId"
  const val EXTRA_MAX_ITEMS = "maxItems"
  const val EXTRA_MESSAGE = "message"
  const val EXTRA_TS = "ts"
  const val EXTRA_ERROR = "error"
  const val EXTRA_STOPPED = "stopped"
  const val EXTRA_PRODUCTS_JSON = "productsJson"
  const val EXTRA_RESULT_JSON = "resultJson"
  const val EXTRA_PROFILE_LOCAL_ID = "profileLocalId"

  const val EXTRA_PRODUCT_NAME = "name"
  const val EXTRA_PRODUCT_PRICE = "price"
  const val EXTRA_PRODUCT_STOCK = "stock"
  const val EXTRA_PRODUCT_URL = "productUrl"
  const val EXTRA_PRODUCT_EXTERNAL_ID = "externalProductId"
  const val EXTRA_PRODUCT_IMAGE_URL = "imageUrl"
  const val EXTRA_PRODUCT_STATUS = "status"
  const val EXTRA_PRODUCT_SCRAPED_AT = "scrapedAt"

  fun sendShopeeImportLog(context: Context, message: String, ts: Long = System.currentTimeMillis()) {
    sendEvent(context, ACTION_EVENT_SHOPEE_IMPORT_LOG) {
      putExtra(EXTRA_MESSAGE, message)
      putExtra(EXTRA_TS, ts)
    }
  }

  fun sendShopeeImportProduct(
    context: Context,
    product: ShopeeLikedProduct,
    ts: Long = System.currentTimeMillis(),
    profileLocalId: String? = null
  ) {
    KubdeeShopeeImportQueue.appendProduct(context, product, profileLocalId, ts)
    sendEvent(context, ACTION_EVENT_SHOPEE_IMPORT_PRODUCT) {
      putProductExtras(product, profileLocalId)
      putExtra(EXTRA_TS, ts)
    }
  }

  fun sendShopeeImportFinished(
    context: Context,
    runId: String,
    products: Collection<ShopeeLikedProduct>,
    error: String? = null,
    stopped: Boolean = false,
    profileLocalId: String? = null
  ) {
    sendEvent(context, ACTION_EVENT_SHOPEE_IMPORT_FINISHED) {
      putExtra(EXTRA_RUN_ID, runId)
      putExtra(EXTRA_PRODUCTS_JSON, JSONArray(products.map { it.toJsonObject(profileLocalId) }).toString())
      putExtra(EXTRA_STOPPED, stopped)
      putNullableString(EXTRA_PROFILE_LOCAL_ID, profileLocalId)
      if (!error.isNullOrBlank()) {
        putExtra(EXTRA_ERROR, error)
      }
    }
  }

  fun sendShopeePostLog(context: Context, message: String, ts: Long = System.currentTimeMillis()) {
    sendEvent(context, ACTION_EVENT_SHOPEE_POST_LOG) {
      putExtra(EXTRA_MESSAGE, message)
      putExtra(EXTRA_TS, ts)
    }
  }

  fun sendShopeePostFinished(
    context: Context,
    runId: String,
    result: JSONObject,
    error: String? = null,
    stopped: Boolean = false
  ) {
    sendEvent(context, ACTION_EVENT_SHOPEE_POST_FINISHED) {
      putExtra(EXTRA_RUN_ID, runId)
      putExtra(EXTRA_RESULT_JSON, result.toString())
      putExtra(EXTRA_STOPPED, stopped)
      if (!error.isNullOrBlank()) {
        putExtra(EXTRA_ERROR, error)
      }
    }
  }

  private fun sendEvent(context: Context, action: String, configure: Intent.() -> Unit) {
    val intent = Intent(action).apply {
      setPackage(context.packageName)
      configure()
    }
    try {
      context.sendBroadcast(intent)
    } catch (error: Exception) {
      Log.w(TAG, "Unable to send automation event: $action", error)
    }
  }

  private fun Intent.putNullableString(key: String, value: String?) {
    if (!value.isNullOrBlank()) {
      putExtra(key, value)
    }
  }

  private fun Intent.putProductExtras(product: ShopeeLikedProduct, profileLocalId: String? = null) {
    putExtra(EXTRA_PRODUCT_NAME, product.name)
    putNullableString(EXTRA_PRODUCT_PRICE, product.price)
    product.stock?.let { putExtra(EXTRA_PRODUCT_STOCK, it) }
    putNullableString(EXTRA_PRODUCT_URL, product.productUrl)
    putNullableString(EXTRA_PRODUCT_EXTERNAL_ID, product.externalProductId)
    putNullableString(EXTRA_PRODUCT_IMAGE_URL, product.imageUrl)
    putExtra(EXTRA_PRODUCT_STATUS, product.status)
    putExtra(EXTRA_PRODUCT_SCRAPED_AT, product.scrapedAt)
    putNullableString(EXTRA_PROFILE_LOCAL_ID, profileLocalId)
  }

  private fun ShopeeLikedProduct.toJsonObject(profileLocalId: String? = null): JSONObject =
    JSONObject().apply {
      put("name", name)
      put("price", price)
      put("stock", stock)
      put("productUrl", productUrl)
      put("externalProductId", externalProductId)
      put("imageUrl", imageUrl)
      put("status", status)
      put("scrapedAt", scrapedAt)
      if (!profileLocalId.isNullOrBlank()) {
        put("profileLocalId", profileLocalId)
      }
    }
}
